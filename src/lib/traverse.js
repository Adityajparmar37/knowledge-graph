import {
  getAllSkills,
  getAllStandards,
  getParentSkillId,
  getSkill,
  getSkillsLinkingTo,
  getStandard,
  getStandardIdsForSubject,
  getSubject,
  getSubjectIdsForSkill,
} from "./graphStore.js";

function toStandardSummary(standard) {
  if (!standard) return null;
  const { id, code, description, grade } = standard;
  return { id, code, description, grade };
}

/**
 * Exact, case-insensitive match against a standard's `code` or a skill's `name`.
 * @param {string} term
 * @returns {{ type: "standard", id: string } | { type: "skill", id: string } | { type: "none" }}
 */
export function search(term) {
  if (typeof term !== "string" || term.trim().length === 0) {
    return { type: "none" };
  }
  const normalized = term.trim().toLowerCase();

  const matchedStandard = getAllStandards().find(
    (standard) => standard.code.toLowerCase() === normalized
  );
  if (matchedStandard) {
    return { type: "standard", id: matchedStandard.id };
  }

  const matchedSkill = getAllSkills().find(
    (skill) => skill.name.toLowerCase() === normalized
  );
  if (matchedSkill) {
    return { type: "skill", id: matchedSkill.id };
  }

  return { type: "none" };
}

/**
 * Full render payload for a standard: the standard, its subjects, and each
 * subject's skills (with pass criteria).
 * @param {string} id standard id
 * @returns {{ standard: object, subjects: object[] } | null}
 */
export function getStandardBreakdown(id) {
  const standard = getStandard(id);
  if (!standard) return null;

  const subjects = standard.subjectIds.map((subjectId) => {
    const subject = getSubject(subjectId);
    if (!subject) return null;

    const skills = subject.skillIds
      .map((skillId) => {
        const skill = getSkill(skillId);
        if (!skill) return null;
        return { id: skill.id, name: skill.name, passCriteria: skill.passCriteria };
      })
      .filter(Boolean);

    return { id: subject.id, name: subject.name, skills };
  }).filter(Boolean);

  return {
    standard: {
      id: standard.id,
      code: standard.code,
      description: standard.description,
      grade: standard.grade,
    },
    subjects,
  };
}

/**
 * Grade-to-grade progression for a standard.
 * @param {string} id standard id
 * @returns {{ buildsFrom: object[], current: object, buildsToward: object[] } | null}
 */
export function getStandardProgression(id) {
  const standard = getStandard(id);
  if (!standard) return null;

  const buildsFrom = standard.buildsFrom
    .map((standardId) => toStandardSummary(getStandard(standardId)))
    .filter(Boolean);

  const buildsToward = standard.buildsToward
    .map((standardId) => toStandardSummary(getStandard(standardId)))
    .filter(Boolean);

  return {
    buildsFrom,
    current: toStandardSummary(standard),
    buildsToward,
  };
}

/**
 * Recursively walks a skill's prerequisite chain, breadth-first, deduping
 * skills that are reachable via multiple paths (keeping their shortest depth).
 * @param {string} id skill id
 * @returns {{ skill: object, chain: { id: string, name: string, depth: number }[] } | null}
 */
export function getSkillPrerequisites(id) {
  const skill = getSkill(id);
  if (!skill) return null;

  const depthById = new Map();
  const queue = (skill.prerequisiteSkillIds || []).map((prereqId) => ({
    id: prereqId,
    depth: 1,
  }));

  while (queue.length > 0) {
    const { id: currentId, depth } = queue.shift();
    const existingDepth = depthById.get(currentId);
    if (existingDepth !== undefined && existingDepth <= depth) {
      continue;
    }
    depthById.set(currentId, depth);

    const prereqSkill = getSkill(currentId);
    if (!prereqSkill) continue;

    for (const nextId of prereqSkill.prerequisiteSkillIds || []) {
      queue.push({ id: nextId, depth: depth + 1 });
    }
  }

  const chain = Array.from(depthById.entries())
    .map(([skillId, depth]) => {
      const prereqSkill = getSkill(skillId);
      if (!prereqSkill) return null;
      return { id: prereqSkill.id, name: prereqSkill.name, depth };
    })
    .filter(Boolean)
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

  return {
    skill: { id: skill.id, name: skill.name, passCriteria: skill.passCriteria },
    chain,
  };
}

/**
 * Reverse lookup: which subject(s) contain a skill, and which standard(s)
 * contain those subjects.
 * @param {string} id skill id
 * @returns {{ skill: object, subjects: object[], standards: object[] } | null}
 */
export function getSkillStandards(id) {
  const skill = getSkill(id);
  if (!skill) return null;

  const subjectIds = getSubjectIdsForSkill(id);
  const subjects = subjectIds
    .map((subjectId) => getSubject(subjectId))
    .filter(Boolean)
    .map((subject) => ({ id: subject.id, name: subject.name }));

  const standardIdSet = new Set();
  for (const subjectId of subjectIds) {
    for (const standardId of getStandardIdsForSubject(subjectId)) {
      standardIdSet.add(standardId);
    }
  }

  const standards = Array.from(standardIdSet)
    .map((standardId) => toStandardSummary(getStandard(standardId)))
    .filter(Boolean);

  return {
    skill: { id: skill.id, name: skill.name },
    subjects,
    standards,
  };
}

/**
 * Reverse lookup for a single skill id: which subject (first match) and
 * which standard (first match) "own" it. Used to jump the whole explorer
 * to a cross-grade linked skill's home standard/subject.
 * @param {string} skillId
 * @returns {{ subjectId: string, standardId: string } | null}
 */
export function getSkillOwner(skillId) {
  const subjectIds = getSubjectIdsForSkill(skillId);
  for (const subjectId of subjectIds) {
    const [standardId] = getStandardIdsForSubject(subjectId);
    if (standardId) {
      return { subjectId, standardId };
    }
  }
  return null;
}

/**
 * Standard summaries for a standard's `buildsToward` ids, used to populate
 * the "next standard" picker once a standard is fully mastered.
 * @param {string} id standard id
 * @returns {object[]}
 */
export function getNextStandardOptions(id) {
  const standard = getStandard(id);
  if (!standard) return [];

  return standard.buildsToward
    .map((standardId) => toStandardSummary(getStandard(standardId)))
    .filter(Boolean);
}

/**
 * Lightweight id/name summaries of the Subjects attached to a standard
 * (no skills resolved) — used by the progressive Standard graph, which
 * only needs to render Subject nodes, not their skill trees.
 * @param {string} id standard id
 * @returns {{ id: string, name: string }[]}
 */
export function getStandardSubjectSummaries(id) {
  const standard = getStandard(id);
  if (!standard) return [];

  return standard.subjectIds
    .map((subjectId) => getSubject(subjectId))
    .filter(Boolean)
    .map((subject) => ({ id: subject.id, name: subject.name }));
}

/**
 * Normalizes a raw skill (or sub-skill) record into the summary shape used
 * throughout the UI: id, name, passCriteria, a worked example string, and
 * the ids of any sub-skills nested under it.
 * @param {object|undefined} skill
 * @returns {{ id: string, name: string, passCriteria: string[], example: string, subSkillIds: string[] } | null}
 */
function toSkillSummary(skill) {
  if (!skill) return null;
  return {
    id: skill.id,
    name: skill.name,
    passCriteria: skill.passCriteria || [],
    example: skill.example || '',
    subSkillIds: skill.subSkillIds || [],
    linkedSkillId: skill.linkedSkillId || null,
  };
}

/**
 * Full summary (with example + sub-skill ids) for a single skill or
 * sub-skill id. Sub-skills are stored as ordinary entries in skills.json,
 * so this works for either.
 * @param {string} id
 * @returns {{ id, name, passCriteria, example, subSkillIds } | null}
 */
export function getSkillSummary(id) {
  return toSkillSummary(getSkill(id));
}

/**
 * Resolves a skill's `subSkillIds` into full sub-skill summaries, in order.
 * @param {string} id skill id
 * @returns {object[]}
 */
export function getSubSkills(id) {
  const skill = getSkill(id);
  if (!skill) return [];
  return (skill.subSkillIds || []).map((subId) => toSkillSummary(getSkill(subId))).filter(Boolean);
}

/**
 * A subject plus its top-level skills (each including example/subSkillIds),
 * used to seed the Subject -> Skill drill-down graph.
 * @param {string} subjectId
 * @returns {{ id: string, name: string, skills: object[] } | null}
 */
export function getSubjectSkillSummary(subjectId) {
  const subject = getSubject(subjectId);
  if (!subject) return null;

  return {
    id: subject.id,
    name: subject.name,
    skills: subject.skillIds.map((skillId) => toSkillSummary(getSkill(skillId))).filter(Boolean),
  };
}

/**
 * @param {string} subjectId
 * @returns {string|null} the Common-Core-style domain string attached to a subject, if any
 */
export function getSubjectDomain(subjectId) {
  const subject = getSubject(subjectId);
  return (subject && subject.domain) || null;
}

/**
 * Builds a diagnostic "remediation path" for a skill a teacher has just
 * flagged as failing: its sibling skills in the same Subject (foundational
 * pieces of the same cluster worth shoring up alongside it) plus the
 * owning Standard's real grade-progression chain (`buildsFrom`, walked
 * backward through however many grades exist) — the earlier-grade
 * material worth reviewing. There's no skill-level prerequisite graph in
 * the real imported data, so this is the closest real-data equivalent.
 * @param {string} skillId
 * @returns {{
 *   skill: object,
 *   subjectId: string|null,
 *   subjectName: string|null,
 *   standardId: string|null,
 *   siblings: object[],
 *   gradeChain: { id: string, code: string, description: string, grade: number }[],
 * } | null}
 */
export function getRemediationPath(skillId) {
  const skill = getSkillSummary(skillId);
  if (!skill) return null;

  const owner = getSkillOwner(skillId);
  const subject = owner ? getSubjectSkillSummary(owner.subjectId) : null;
  const siblings = subject ? subject.skills.filter((s) => s.id !== skillId) : [];

  const gradeChain = [];
  if (owner) {
    let current = getStandard(owner.standardId);
    const seen = new Set([owner.standardId]);
    while (current && (current.buildsFrom || []).length > 0) {
      const prevId = current.buildsFrom[0];
      if (seen.has(prevId)) break;
      seen.add(prevId);
      const prev = getStandard(prevId);
      if (!prev) break;
      gradeChain.push({ id: prev.id, code: prev.code, description: prev.description, grade: prev.grade });
      current = prev;
    }
  }

  return {
    skill,
    subjectId: owner ? owner.subjectId : null,
    subjectName: subject ? subject.name : null,
    standardId: owner ? owner.standardId : null,
    siblings,
    gradeChain,
  };
}

function toNodeChip(kind, id, label) {
  return { kind, id, label };
}

/**
 * Structural detail resolver for the standalone Node Detail page: given a
 * `kind` ("standard" | "subject" | "skill" — sub-skills are just `skill`
 * records too) and an id, resolves everything the detail page needs to
 * render: the raw record, its grade, its domain/cluster context, its full
 * parent chain, its children, its prerequisites, and its cross-grade link
 * in both directions. Pass/fail status is intentionally left to the
 * caller (via lib/attempts.js) since this module has no notion of students.
 * @param {"standard"|"subject"|"skill"} kind
 * @param {string} id
 * @returns {object|null}
 */
export function getNodeDetail(kind, id) {
  if (kind === "standard") return getStandardNodeDetail(id);
  if (kind === "subject") return getSubjectNodeDetail(id);
  if (kind === "skill") return getSkillNodeDetail(id);
  return null;
}

function getStandardNodeDetail(id) {
  const standard = getStandard(id);
  if (!standard) return null;

  const children = standard.subjectIds
    .map((subjectId) => {
      const subject = getSubject(subjectId);
      return subject ? toNodeChip("subject", subject.id, subject.name) : null;
    })
    .filter(Boolean);

  const buildsFrom = (standard.buildsFrom || [])
    .map((standardId) => {
      const s = getStandard(standardId);
      return s ? toNodeChip("standard", s.id, s.code) : null;
    })
    .filter(Boolean);

  const buildsToward = (standard.buildsToward || [])
    .map((standardId) => {
      const s = getStandard(standardId);
      return s ? toNodeChip("standard", s.id, s.code) : null;
    })
    .filter(Boolean);

  return {
    kind: "standard",
    id: standard.id,
    name: standard.code,
    grade: standard.grade,
    own: standard,
    parentChain: [],
    children,
    domain: null,
    cluster: [],
    prerequisites: [],
    linkedSkill: null,
    reverseLinkedSkills: [],
    buildsFrom,
    buildsToward,
  };
}

function getSubjectNodeDetail(id) {
  const subject = getSubject(id);
  if (!subject) return null;

  const standardIds = getStandardIdsForSubject(id);
  const standards = standardIds.map((standardId) => getStandard(standardId)).filter(Boolean);
  const grade = standards.length > 0 ? standards[0].grade : null;

  const parentChain = standards.map((standard) => toNodeChip("standard", standard.id, standard.code));

  const children = subject.skillIds
    .map((skillId) => {
      const skill = getSkill(skillId);
      return skill ? toNodeChip("skill", skill.id, skill.name) : null;
    })
    .filter(Boolean);

  return {
    kind: "subject",
    id: subject.id,
    name: subject.name,
    grade,
    own: subject,
    parentChain,
    children,
    domain: subject.domain || null,
    cluster: standards.map((standard) => ({ code: standard.code, description: standard.description })),
    prerequisites: [],
    linkedSkill: null,
    reverseLinkedSkills: [],
    buildsFrom: [],
    buildsToward: [],
  };
}

function getSkillNodeDetail(id) {
  const skill = getSkill(id);
  if (!skill) return null;

  // A skill is either listed directly in a subject's skillIds (top-level),
  // or nested under another skill's subSkillIds (a sub-skill). Work out
  // which so the parent chain and owning subject/standard resolve correctly.
  const directSubjectIds = getSubjectIdsForSkill(id);
  let subjectId = directSubjectIds[0] || null;
  let parentSkillChip = null;

  if (!subjectId) {
    const parentSkillId = getParentSkillId(id);
    if (parentSkillId) {
      const parentSkill = getSkill(parentSkillId);
      parentSkillChip = parentSkill ? toNodeChip("skill", parentSkill.id, parentSkill.name) : null;
      subjectId = getSubjectIdsForSkill(parentSkillId)[0] || null;
    }
  }

  const subject = subjectId ? getSubject(subjectId) : null;
  const standardIds = subjectId ? getStandardIdsForSubject(subjectId) : [];
  const standards = standardIds.map((standardId) => getStandard(standardId)).filter(Boolean);
  const grade = standards.length > 0 ? standards[0].grade : null;

  const parentChain = [];
  if (parentSkillChip) parentChain.push(parentSkillChip);
  if (subject) parentChain.push(toNodeChip("subject", subject.id, subject.name));
  standards.forEach((standard) => parentChain.push(toNodeChip("standard", standard.id, standard.code)));

  const children = (skill.subSkillIds || [])
    .map((subSkillId) => {
      const subSkill = getSkill(subSkillId);
      return subSkill ? toNodeChip("skill", subSkill.id, subSkill.name) : null;
    })
    .filter(Boolean);

  const prerequisites = (skill.prerequisiteSkillIds || [])
    .map((prereqId) => {
      const prereq = getSkill(prereqId);
      return prereq ? toNodeChip("skill", prereq.id, prereq.name) : null;
    })
    .filter(Boolean);

  let linkedSkill = null;
  if (skill.linkedSkillId) {
    const linked = getSkill(skill.linkedSkillId);
    linkedSkill = linked ? toNodeChip("skill", linked.id, linked.name) : null;
  }

  const reverseLinkedSkills = getSkillsLinkingTo(id)
    .map((linkerId) => {
      const linker = getSkill(linkerId);
      return linker ? toNodeChip("skill", linker.id, linker.name) : null;
    })
    .filter(Boolean);

  return {
    kind: "skill",
    id: skill.id,
    name: skill.name,
    grade,
    own: skill,
    parentChain,
    children,
    domain: subject ? subject.domain || null : null,
    cluster: standards.map((standard) => ({ code: standard.code, description: standard.description })),
    prerequisites,
    linkedSkill,
    reverseLinkedSkills,
    buildsFrom: [],
    buildsToward: [],
  };
}
