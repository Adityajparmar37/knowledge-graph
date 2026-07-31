// USAGE: node src/build_app_data_from_real.js
// Transforms the real Common Core hierarchy (all_data_hierarchy.json) into
// this app's Standard->Subject->Skill->SubSkill schema:
//   Domain (real)   -> Standard (app)  — grade-scoped, has buildsFrom/buildsToward
//   Cluster (real)  -> Subject (app)   — carries `domain` = parent Domain's name
//   Standard (real) -> Skill (app)
//   Component (real)-> Sub-skill (app)
//
// Pass criteria/examples don't exist in the real feed, so they're
// synthesized mechanically from the real description text (clearly
// derived, not invented prose). Cross-grade `linkedSkillId` links aren't
// fabricated at this scale — buildsFrom/buildsToward (grade progression at
// the Standard/Domain level) already covers that, chained by matching
// domain name across consecutive grades. Student attempts are generated
// deterministically (hash of studentId+skillId) so a re-run is reproducible.
import fs from "fs";

const CONTENT_ROOT_IDS = [
  "6b9cbaef-d7cc-11e8-824f-0242ac160002", // Standards for Math Content (K-8)
  "6b9cc50c-d7cc-11e8-824f-0242ac160002", // Standards for HS Math Content
];

const GRADE_ORDER = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9-12"];

function normalizeGrade(gradeLevel) {
  if (!gradeLevel || gradeLevel.length === 0) return "9-12";
  if (gradeLevel.length > 1) return "9-12"; // HS band ["9","10","11","12"]
  return gradeLevel[0];
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1).trimEnd()}…`;
}

function slug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Deterministic small hash -> [0, 1) for reproducible synthetic data.
function hashFraction(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000;
}

function main() {
  const raw = JSON.parse(fs.readFileSync("all_data_hierarchy.json", "utf-8"));
  const nodes = raw.nodes;

  // Only walk into Domain-type children under each Grade Level / Conceptual
  // Category — skips the "Standards for Mathematical Practice" branches
  // nested alongside them, which don't fit the grade-progression model.
  const domains = [];
  for (const rootId of CONTENT_ROOT_IDS) {
    const root = nodes[rootId];
    for (const gradeGroupId of root.childIds) {
      const gradeGroup = nodes[gradeGroupId];
      if (!gradeGroup || gradeGroup.statementType == null) continue; // skip MP groupings
      for (const domainId of gradeGroup.childIds) {
        const domain = nodes[domainId];
        if (domain && domain.statementType === "Domain") domains.push(domain);
      }
    }
  }

  console.log(`Found ${domains.length} real Domains (-> app Standards).`);

  const standards = [];
  const subjects = [];
  const skills = [];

  // Group domains by normalized name so we can chain buildsFrom/buildsToward
  // across consecutive grades for "the same" domain (e.g. "Number &
  // Operations in Base Ten" appears in grades K-5).
  const domainsByName = new Map();
  for (const domain of domains) {
    const key = domain.description;
    if (!domainsByName.has(key)) domainsByName.set(key, []);
    domainsByName.get(key).push(domain);
  }
  for (const list of domainsByName.values()) {
    list.sort((a, b) => GRADE_ORDER.indexOf(normalizeGrade(a.gradeLevel)) - GRADE_ORDER.indexOf(normalizeGrade(b.gradeLevel)));
  }

  const standardIdByDomainUUID = new Map();

  for (const domain of domains) {
    // Domain nodes have no statementCode of their own — derive one from the
    // shared prefix of its Cluster children's real codes (e.g. clusters
    // "5.NBT.A"/"5.NBT.B" -> domain code "5.NBT").
    const clusterCodes = domain.childIds
      .map((id) => nodes[id])
      .filter((n) => n && n.statementCode)
      .map((n) => n.statementCode);
    const derivedCode =
      clusterCodes.length > 0
        ? clusterCodes[0].split(".").slice(0, 2).join(".")
        : slug(domain.description).toUpperCase();

    const grade = normalizeGrade(domain.gradeLevel);
    const gradeNum = grade === "K" ? 0 : grade === "9-12" ? 9 : Number(grade);

    const standardId = `std-${domain.caseIdentifierUUID}`;
    standardIdByDomainUUID.set(domain.caseIdentifierUUID, standardId);

    standards.push({
      id: standardId,
      code: derivedCode,
      jurisdiction: "Multi-State",
      grade: gradeNum,
      description: domain.description,
      buildsToward: [], // filled in after all standards are built (needs ids)
      buildsFrom: [],
      subjectIds: domain.childIds
        .map((id) => nodes[id])
        .filter((n) => n && n.statementType === "Cluster")
        .map((n) => `subj-${n.caseIdentifierUUID}`),
    });

    for (const clusterId of domain.childIds) {
      const cluster = nodes[clusterId];
      if (!cluster || cluster.statementType !== "Cluster") continue;

      subjects.push({
        id: `subj-${cluster.caseIdentifierUUID}`,
        name: truncate(cluster.description, 60),
        fullName: cluster.description,
        domain: domain.description,
        skillIds: cluster.childIds
          .map((id) => nodes[id])
          .filter((n) => n && (n.statementType === "Standard" || n.statementType === "Content Standard"))
          .map((n) => `skill-${n.caseIdentifierUUID}`),
      });

      for (const skillNodeId of cluster.childIds) {
        const skillNode = nodes[skillNodeId];
        if (!skillNode || (skillNode.statementType !== "Standard" && skillNode.statementType !== "Content Standard")) continue;

        const components = skillNode.childIds
          .map((id) => nodes[id])
          .filter((n) => n && n.statementType === "Component");

        skills.push({
          id: `skill-${skillNode.caseIdentifierUUID}`,
          name: skillNode.statementCode || skillNode.description.slice(0, 40),
          passCriteria: [`Meet the expectations of ${skillNode.statementCode || "this standard"}: ${skillNode.description}`],
          example: null,
          prerequisiteSkillIds: [],
          subSkillIds: components.map((c) => `skill-${c.caseIdentifierUUID}`),
        });

        for (const component of components) {
          skills.push({
            id: `skill-${component.caseIdentifierUUID}`,
            name: component.statementCode || component.description.slice(0, 40),
            passCriteria: [`Meet the expectations of ${component.statementCode || "this sub-standard"}: ${component.description}`],
            example: null,
            prerequisiteSkillIds: [],
            subSkillIds: [],
          });
        }
      }
    }
  }

  // Chain buildsFrom/buildsToward across consecutive grades for domains
  // sharing the same name.
  const standardById = new Map(standards.map((s) => [s.id, s]));
  for (const list of domainsByName.values()) {
    for (let i = 0; i < list.length - 1; i++) {
      const fromId = standardIdByDomainUUID.get(list[i].caseIdentifierUUID);
      const toId = standardIdByDomainUUID.get(list[i + 1].caseIdentifierUUID);
      standardById.get(fromId).buildsToward.push(toId);
      standardById.get(toId).buildsFrom.push(fromId);
    }
  }

  // --- Students + synthetic attempts ---
  const students = [
    { id: "student-alex", name: "Alex Rivera" },
    { id: "student-priya", name: "Priya Nair" },
    { id: "student-sam", name: "Sam Okafor" },
  ];

  const skillAttempts = {};
  for (const student of students) {
    const record = {};
    for (const skill of skills) {
      const f = hashFraction(student.id + skill.id);
      if (f < 0.18) record[skill.id] = "fail";
      else if (f < 0.75) record[skill.id] = "pass";
      // else: left unattempted (absent from record)
    }
    skillAttempts[student.id] = record;
  }

  fs.mkdirSync("src/data", { recursive: true });
  fs.writeFileSync("src/data/standards.json", JSON.stringify(standards, null, 2));
  fs.writeFileSync("src/data/subjects.json", JSON.stringify(subjects, null, 2));
  fs.writeFileSync("src/data/skills.json", JSON.stringify(skills, null, 2));
  fs.writeFileSync("src/data/students.json", JSON.stringify(students, null, 2));
  fs.writeFileSync("src/data/skillAttempts.json", JSON.stringify(skillAttempts, null, 2));

  console.log(`Wrote ${standards.length} standards, ${subjects.length} subjects, ${skills.length} skills.`);
  console.log(`Grade range: ${[...new Set(standards.map((s) => s.grade))].sort((a, b) => a - b).join(", ")}`);
}

main();
