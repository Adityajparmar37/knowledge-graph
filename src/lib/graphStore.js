import standardsData from "../data/standards.json";
import subjectsData from "../data/subjects.json";
import skillsData from "../data/skills.json";

// Primary lookup maps, keyed by id, built once at module-load time.
export const standardsById = new Map(standardsData.map((standard) => [standard.id, standard]));
export const subjectsById = new Map(subjectsData.map((subject) => [subject.id, subject]));
export const skillsById = new Map(skillsData.map((skill) => [skill.id, skill]));

// Reverse map: skillId -> array of subject ids that list that skill in skillIds.
export const subjectIdsBySkillId = new Map();
for (const subject of subjectsData) {
  for (const skillId of subject.skillIds) {
    if (!subjectIdsBySkillId.has(skillId)) {
      subjectIdsBySkillId.set(skillId, []);
    }
    subjectIdsBySkillId.get(skillId).push(subject.id);
  }
}

// Reverse map: subjectId -> array of standard ids that list that subject in subjectIds.
export const standardIdsBySubjectId = new Map();
for (const standard of standardsData) {
  for (const subjectId of standard.subjectIds) {
    if (!standardIdsBySubjectId.has(subjectId)) {
      standardIdsBySubjectId.set(subjectId, []);
    }
    standardIdsBySubjectId.get(subjectId).push(standard.id);
  }
}

// Reverse map: sub-skill id -> the id of the skill that lists it in subSkillIds.
export const parentSkillIdBySkillId = new Map();
for (const skill of skillsData) {
  for (const subSkillId of skill.subSkillIds || []) {
    parentSkillIdBySkillId.set(subSkillId, skill.id);
  }
}

// Reverse map: skillId -> array of skill ids whose `linkedSkillId` points at it
// (the cross-grade link, browsable in both directions).
export const linkerSkillIdsByTargetId = new Map();
for (const skill of skillsData) {
  if (skill.linkedSkillId) {
    if (!linkerSkillIdsByTargetId.has(skill.linkedSkillId)) {
      linkerSkillIdsByTargetId.set(skill.linkedSkillId, []);
    }
    linkerSkillIdsByTargetId.get(skill.linkedSkillId).push(skill.id);
  }
}

/** @returns {object[]} all standard records, in seed-data order */
export function getAllStandards() {
  return standardsData;
}

/** @returns {object[]} all subject records, in seed-data order */
export function getAllSubjects() {
  return subjectsData;
}

/** @returns {object[]} all skill records, in seed-data order */
export function getAllSkills() {
  return skillsData;
}

/** @param {string} id @returns {object|undefined} */
export function getStandard(id) {
  return standardsById.get(id);
}

/** @param {string} id @returns {object|undefined} */
export function getSubject(id) {
  return subjectsById.get(id);
}

/** @param {string} id @returns {object|undefined} */
export function getSkill(id) {
  return skillsById.get(id);
}

/** @param {string} skillId @returns {string[]} subject ids containing this skill */
export function getSubjectIdsForSkill(skillId) {
  return subjectIdsBySkillId.get(skillId) || [];
}

/** @param {string} subjectId @returns {string[]} standard ids containing this subject */
export function getStandardIdsForSubject(subjectId) {
  return standardIdsBySubjectId.get(subjectId) || [];
}

/**
 * @param {string} subSkillId
 * @returns {string|null} the id of the skill that owns this id as a sub-skill, or null
 *   if it isn't nested under anything (i.e. it's a top-level skill).
 */
export function getParentSkillId(subSkillId) {
  return parentSkillIdBySkillId.get(subSkillId) || null;
}

/**
 * Reverse lookup for cross-grade `linkedSkillId` links.
 * @param {string} skillId
 * @returns {string[]} ids of every skill whose `linkedSkillId` points at this skill
 */
export function getSkillsLinkingTo(skillId) {
  return linkerSkillIdsByTargetId.get(skillId) || [];
}
