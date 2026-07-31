#!/usr/bin/env python3
"""
USAGE: python3 src/build_from_kg_export.py

Builds the app's Standard/Subject/Skill/SubSkill data files from the full
Learning Commons Knowledge Graph export (nodes.jsonl + relationships.jsonl),
covering all 52 real state Mathematics frameworks.

Each state uses different terminology for its own standards hierarchy
(Texas "Student Expectation", Colorado "Evidence Outcome", etc.), but the
`normalizedStatementType` property collapses all of them into just two
buckets: "Standard Grouping" (Domain/Cluster/Strand/Grade Level/...) and
"Standard" (Standard/Component/Element/Benchmark/...). This script walks
the real hasChild tree per jurisdiction using that normalized bucketing:

  2 levels of "Standard Grouping" immediately above a "Standard" chain
    -> app Standard (outer grouping) / app Subject (inner grouping)
  "Standard" chain (up to 2 levels deep)
    -> app Skill (top) / app Sub-skill (nested "Component")

States whose tree doesn't fit this shape (e.g. a Subject with no wrapping
Standard grouping) get a synthetic pass-through Standard so nothing is
silently dropped. Cross-state alignment (hasStandardAlignment) becomes the
real `linkedSkillId`. Real curriculum content (Illustrative Mathematics
Activities/Assessments, hasEducationalAlignment) becomes the `example`
field where it exists.
"""
import json
import re
import hashlib
from collections import defaultdict

NODES_PATH = "/Users/adityaparmar/Downloads/nodes.jsonl"
RELS_PATH = "/Users/adityaparmar/Downloads/relationships.jsonl"

GRADE_ORDER = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9-12"]


def normalize_grade(grade_level_raw):
    try:
        grades = json.loads(grade_level_raw) if grade_level_raw else []
    except (TypeError, json.JSONDecodeError):
        grades = []
    if not grades or len(grades) > 1:
        return "9-12"
    return grades[0]


def grade_to_num(grade):
    if grade == "K":
        return 0
    if grade == "9-12":
        return 9
    try:
        return int(grade)
    except ValueError:
        return 9


def truncate(text, max_len):
    text = (text or "").strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def slug_id(prefix, identifier):
    return f"{prefix}-{identifier}"


def hash_fraction(s):
    h = hashlib.md5(s.encode("utf-8")).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


print("Pass 1/3: reading nodes.jsonl for Mathematics StandardsFrameworkItem + curriculum content...")
math_items = {}  # identifier -> dict
content_items = {}  # identifier -> dict (LearningComponent/Activity/Lesson/Assessment/Course, Math only)

CONTENT_LABELS = {"LearningComponent", "Activity", "Lesson", "Assessment", "Course"}

with open(NODES_PATH) as f:
    for i, line in enumerate(f):
        d = json.loads(line)
        labels = d.get("labels", [])
        props = d.get("properties", {})
        if props.get("academicSubject") != "Mathematics":
            continue
        if "StandardsFrameworkItem" in labels:
            math_items[d["identifier"]] = {
                "identifier": d["identifier"],
                "caseIdentifierUUID": props.get("caseIdentifierUUID"),
                "jurisdiction": props.get("jurisdiction") or "Unknown",
                "grade": normalize_grade(props.get("gradeLevel")),
                "description": props.get("description") or props.get("statementCode") or "",
                "statementCode": props.get("statementCode"),
                "statementType": props.get("statementType"),
                "normalizedStatementType": props.get("normalizedStatementType"),
                "childIds": [],
            }
        elif labels and labels[0] in CONTENT_LABELS:
            content_items[d["identifier"]] = {
                "identifier": d["identifier"],
                "label": labels[0],
                "name": props.get("name"),
                "curriculumLabel": props.get("curriculumLabel"),
                "courseCode": props.get("courseCode"),
                "author": props.get("author"),
            }
        if i % 2_000_000 == 0:
            print(f"  ...scanned {i} node lines")

print(f"  Math StandardsFrameworkItem: {len(math_items)}")
print(f"  Math curriculum content nodes: {len(content_items)}")

print("\nPass 2/3: reading relationships.jsonl for hasChild / hasStandardAlignment / hasEducationalAlignment...")
child_target_ids = set()
alignment_pairs = []  # (state_item_id, commoncore_item_id) - real cross-jurisdiction link
example_by_skill = defaultdict(list)  # math_item_id -> [content_identifier, ...]

with open(RELS_PATH) as f:
    for i, line in enumerate(f):
        d = json.loads(line)
        label = d.get("label")
        s = d.get("source_identifier")
        t = d.get("target_identifier")

        if label == "hasChild" and s in math_items and t in math_items:
            math_items[s]["childIds"].append(t)
            child_target_ids.add(t)
        elif label == "hasStandardAlignment" and s in math_items and t in math_items:
            alignment_pairs.append((s, t))
        elif label == "hasEducationalAlignment" and s in content_items and t in math_items:
            example_by_skill[t].append(s)

        if i % 4_000_000 == 0:
            print(f"  ...scanned {i} relationship lines")

print(f"  hasChild edges applied: {sum(len(v['childIds']) for v in math_items.values())}")
print(f"  cross-jurisdiction alignment pairs: {len(alignment_pairs)}")
print(f"  skills with real curriculum examples: {len(example_by_skill)}")

print("\nPass 3/3: building per-jurisdiction Standard/Subject/Skill/SubSkill tree...")

by_jurisdiction = defaultdict(list)
for item in math_items.values():
    by_jurisdiction[item["jurisdiction"]].append(item)

standards = []
subjects = []
skills = []
skill_id_by_math_item_id = {}  # math item identifier -> app skill id (for linkedSkillId + examples)
standard_id_by_domain_key = {}  # (jurisdiction, description) -> list of (grade, standard_id) for chaining

skipped_malformed = 0

for jurisdiction, items in by_jurisdiction.items():
    by_id = {it["identifier"]: it for it in items}
    roots = [it for it in items if it["identifier"] not in child_target_ids]

    def classify(item):
        n = item["normalizedStatementType"]
        if n == "Standard Grouping":
            return "group"
        if n == "Standard":
            return "standard"
        return None

    def children_of(item):
        return [by_id[cid] for cid in item["childIds"] if cid in by_id]

    def walk_to_standard_groupings(node, path):
        """DFS from a root; whenever we find a 'group' node whose children
        are all 'group' nodes that themselves directly parent 'standard'
        nodes, treat that node as an app-Standard and its children as
        app-Subjects. Also handles a 'group' node that directly parents
        'standard' nodes with no intermediate grouping (synthetic subject)."""
        kind = classify(node)
        if kind != "group":
            for child in children_of(node):
                walk_to_standard_groupings(child, path + [node])
            return

        kids = children_of(node)
        kid_kinds = {classify(k) for k in kids}

        if kids and kid_kinds == {"group"}:
            grandkid_kinds = set()
            for k in kids:
                grandkid_kinds.update(classify(gk) for gk in children_of(k))
            if "standard" in grandkid_kinds:
                emit_standard(node, kids)
                return

        if kids and "standard" in kid_kinds and "group" not in kid_kinds:
            emit_standard(node, [node], synthetic_subject=True)
            return

        for child in kids:
            walk_to_standard_groupings(child, path + [node])

    def emit_standard(domain_node, subject_nodes, synthetic_subject=False):
        global skipped_malformed
        std_id = slug_id("std", domain_node["identifier"])
        grade = domain_node["grade"]
        grade_num = grade_to_num(grade)

        subject_ids = []
        for subj_node in subject_nodes:
            skill_nodes = [c for c in children_of(subj_node) if classify(c) == "standard"] if not synthetic_subject else [
                c for c in children_of(subj_node) if classify(c) == "standard"
            ]
            if not skill_nodes:
                continue
            subj_id = slug_id("subj", subj_node["identifier"]) if not synthetic_subject else slug_id("subj-syn", subj_node["identifier"])
            skill_ids_for_subject = []
            for skill_node in skill_nodes:
                app_skill_id = emit_skill(skill_node)
                skill_ids_for_subject.append(app_skill_id)
            if not skill_ids_for_subject:
                continue
            subjects.append({
                "id": subj_id,
                "name": truncate(subj_node["description"], 60),
                "fullName": subj_node["description"],
                "domain": domain_node["description"],
                "skillIds": skill_ids_for_subject,
            })
            subject_ids.append(subj_id)

        if not subject_ids:
            skipped_malformed += 1
            return

        code = domain_node["statementCode"]
        if not code:
            child_codes = [s["statementCode"] for s in subject_nodes if s.get("statementCode")]
            code = child_codes[0].rsplit(".", 1)[0] if child_codes else re.sub(r"[^A-Za-z0-9]+", "-", domain_node["description"])[:12].strip("-").upper()

        standards.append({
            "id": std_id,
            "code": code,
            "jurisdiction": jurisdiction,
            "grade": grade_num,
            "description": domain_node["description"],
            "buildsToward": [],
            "buildsFrom": [],
            "subjectIds": subject_ids,
        })
        standard_id_by_domain_key.setdefault((jurisdiction, domain_node["description"]), []).append((grade_num, std_id))

    def emit_skill(skill_node):
        if skill_node["identifier"] in skill_id_by_math_item_id:
            return skill_id_by_math_item_id[skill_node["identifier"]]  # already emitted, guards re-entry
        app_id = slug_id("skill", skill_node["identifier"])
        skill_id_by_math_item_id[skill_node["identifier"]] = app_id

        sub_kids = [c for c in children_of(skill_node) if classify(c) == "standard"]
        sub_skill_ids = []
        for sub_node in sub_kids:
            sub_id = slug_id("skill", sub_node["identifier"])
            skill_id_by_math_item_id[sub_node["identifier"]] = sub_id
            code = sub_node["statementCode"]
            skills.append({
                "id": sub_id,
                "name": code or truncate(sub_node["description"], 40),
                "passCriteria": [f"Meet the expectations of {code or 'this sub-standard'}: {sub_node['description']}"],
                "example": None,
                "prerequisiteSkillIds": [],
                "subSkillIds": [],
                "_sourceItemId": sub_node["identifier"],
            })
            sub_skill_ids.append(sub_id)

        code = skill_node["statementCode"]
        skills.append({
            "id": app_id,
            "name": code or truncate(skill_node["description"], 40),
            "passCriteria": [f"Meet the expectations of {code or 'this standard'}: {skill_node['description']}"],
            "example": None,
            "prerequisiteSkillIds": [],
            "subSkillIds": sub_skill_ids,
            "_sourceItemId": skill_node["identifier"],
        })
        return app_id

    for root in roots:
        walk_to_standard_groupings(root, [])

print(f"  Malformed/dropped standard candidates (no valid subjects found): {skipped_malformed}")
print(f"  Standards: {len(standards)}  Subjects: {len(subjects)}  Skills(+SubSkills): {len(skills)}")

# --- Chain buildsFrom/buildsToward across consecutive grades, same jurisdiction+domain name ---
standard_by_id = {s["id"]: s for s in standards}
for (_jurisdiction, _desc), lst in standard_id_by_domain_key.items():
    lst.sort(key=lambda pair: pair[0])  # pair = (grade_num, standard_id)
    for i in range(len(lst) - 1):
        from_id = lst[i][1]
        to_id = lst[i + 1][1]
        if from_id == to_id:
            continue
        standard_by_id[from_id]["buildsToward"].append(to_id)
        standard_by_id[to_id]["buildsFrom"].append(from_id)

# --- Real cross-jurisdiction linkedSkillId, from hasStandardAlignment ---
linked_count = 0
for state_item_id, cc_item_id in alignment_pairs:
    state_skill_id = skill_id_by_math_item_id.get(state_item_id)
    cc_skill_id = skill_id_by_math_item_id.get(cc_item_id)
    if not state_skill_id or not cc_skill_id or state_skill_id == cc_skill_id:
        continue
    # find the skill dict and set linkedSkillId once (first alignment wins)
    for sk in skills:
        if sk["id"] == state_skill_id and not sk.get("linkedSkillId"):
            sk["linkedSkillId"] = cc_skill_id
            linked_count += 1
            break

print(f"  Real cross-jurisdiction links set: {linked_count}")

# --- Real examples from aligned curriculum content ---
example_count = 0
for math_item_id, content_ids in example_by_skill.items():
    app_skill_id = skill_id_by_math_item_id.get(math_item_id)
    if not app_skill_id:
        continue
    content = content_items.get(content_ids[0])
    if not content or not content.get("name"):
        continue
    label = content["curriculumLabel"] or content["label"]
    example_text = f"{content['author'] or 'Illustrative Mathematics'} — {label}: {content['name']}"
    for sk in skills:
        if sk["id"] == app_skill_id:
            sk["example"] = example_text
            example_count += 1
            break

print(f"  Real examples attached: {example_count}")

# strip internal-only field
for sk in skills:
    sk.pop("_sourceItemId", None)

# --- Students + synthetic attempts (deterministic hash-based) ---
students = [
    {"id": "student-alex", "name": "Alex Rivera"},
    {"id": "student-priya", "name": "Priya Nair"},
    {"id": "student-sam", "name": "Sam Okafor"},
]
skill_attempts = {}
for student in students:
    record = {}
    for sk in skills:
        f = hash_fraction(student["id"] + sk["id"])
        if f < 0.18:
            record[sk["id"]] = "fail"
        elif f < 0.75:
            record[sk["id"]] = "pass"
    skill_attempts[student["id"]] = record

with open("src/data/standards.json", "w") as f:
    json.dump(standards, f, indent=2)
with open("src/data/subjects.json", "w") as f:
    json.dump(subjects, f, indent=2)
with open("src/data/skills.json", "w") as f:
    json.dump(skills, f, indent=2)
with open("src/data/students.json", "w") as f:
    json.dump(students, f, indent=2)
with open("src/data/skillAttempts.json", "w") as f:
    json.dump(skill_attempts, f, indent=2)

print(f"\nDONE. Wrote {len(standards)} standards, {len(subjects)} subjects, {len(skills)} skills/sub-skills across {len(by_jurisdiction)} jurisdictions.")
