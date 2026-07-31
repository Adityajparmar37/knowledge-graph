import skillAttempts from '../data/skillAttempts.json';
import { getSkill, getStandard, getSubject } from './graphStore.js';

const OVERRIDE_KEY_PREFIX = 'ssx-mastery-override:';

/**
 * Per-student "retest" overrides layered on top of the static seed data in
 * skillAttempts.json — lets a failed/unattempted skill be marked passed
 * (simulating the student retaking and clearing it) without editing the
 * seed file. Persisted in localStorage, scoped per student. Reading is
 * defensive (private-mode/quota errors just fall back to no overrides).
 */
function readOverrides(studentId) {
  if (!studentId) return {};
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY_PREFIX + studentId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeOverrides(studentId, overrides) {
  try {
    localStorage.setItem(OVERRIDE_KEY_PREFIX + studentId, JSON.stringify(overrides));
  } catch {
    // Storage unavailable (private browsing, quota) — override just won't persist.
  }
}

/**
 * Toggles a skill's pass override for one student: if it's currently
 * failed or unattempted, marks it passed (simulating a successful retest);
 * if it's already passed via an override, clears the override to revert to
 * the original seed status.
 * @param {string|null} studentId
 * @param {string} skillId
 */
export function toggleSkillPassOverride(studentId, skillId) {
  if (!studentId || !skillId) return;
  const overrides = readOverrides(studentId);
  if (overrides[skillId]) {
    delete overrides[skillId];
  } else {
    overrides[skillId] = 'pass';
  }
  writeOverrides(studentId, overrides);
}

/**
 * Per-student, per-skill pass/fail lookup. Any skill/sub-skill id absent
 * from a student's record is treated as "unattempted" rather than an
 * error, so partially-seeded students never crash the UI. A localStorage
 * retest override (see toggleSkillPassOverride) always wins over the seed
 * data when present.
 *
 * @param {string|null} studentId
 * @param {string} skillId
 * @returns {"pass" | "fail" | "unattempted"}
 */
export function getSkillStatus(studentId, skillId) {
  if (!studentId || !skillId) return 'unattempted';
  const overrides = readOverrides(studentId);
  if (overrides[skillId]) return overrides[skillId];
  const studentRecord = skillAttempts[studentId];
  if (!studentRecord) return 'unattempted';
  return studentRecord[skillId] || 'unattempted';
}

/**
 * Combines a list of statuses into one aggregate: "fail" wins if any
 * descendant failed; otherwise "pass" if every attempted descendant
 * passed; otherwise "unattempted" (nothing attempted, or a mix that never
 * included a fail but also never fully passed because some are untried).
 * @param {("pass"|"fail"|"unattempted")[]} statuses
 * @returns {"pass" | "fail" | "unattempted"}
 */
function aggregateStatuses(statuses) {
  if (statuses.includes('fail')) return 'fail';
  const attempted = statuses.filter((status) => status !== 'unattempted');
  if (attempted.length === 0) return 'unattempted';
  return attempted.every((status) => status === 'pass') ? 'pass' : 'unattempted';
}

/**
 * Collects a skill id plus every sub-skill id nested beneath it
 * (recursively, in case the schema ever nests sub-skills of sub-skills).
 * @param {string} skillId
 * @param {Set<string>} [seen]
 * @returns {Set<string>}
 */
function collectSkillAndDescendantIds(skillId, seen = new Set()) {
  if (seen.has(skillId)) return seen;
  seen.add(skillId);
  const skill = getSkill(skillId);
  if (!skill) return seen;
  for (const subId of skill.subSkillIds || []) {
    collectSkillAndDescendantIds(subId, seen);
  }
  return seen;
}

/**
 * A skill's own status aggregated with all of its sub-skills, so a Skill
 * node can be marked "fail" even if the top-level attempt itself is
 * unattempted but a sub-skill underneath it failed.
 * @param {string|null} studentId
 * @param {string} skillId
 * @returns {"pass" | "fail" | "unattempted"}
 */
export function getSkillAggregateStatus(studentId, skillId) {
  if (!studentId) return 'unattempted';
  const ids = collectSkillAndDescendantIds(skillId);
  return aggregateStatuses([...ids].map((id) => getSkillStatus(studentId, id)));
}

/**
 * Aggregate status for every skill under a subject, "fail" wins overall.
 * @param {string|null} studentId
 * @param {string} subjectId
 * @returns {"pass" | "fail" | "unattempted"}
 */
export function getSubjectStatus(studentId, subjectId) {
  if (!studentId) return 'unattempted';
  const subject = getSubject(subjectId);
  if (!subject) return 'unattempted';
  return aggregateStatuses(
    subject.skillIds.map((skillId) => getSkillAggregateStatus(studentId, skillId))
  );
}

/**
 * Aggregate status for every subject under a standard.
 * @param {string|null} studentId
 * @param {string} standardId
 * @returns {"pass" | "fail" | "unattempted"}
 */
export function getStandardStatus(studentId, standardId) {
  if (!studentId) return 'unattempted';
  const standard = getStandard(standardId);
  if (!standard) return 'unattempted';
  return aggregateStatuses(
    standard.subjectIds.map((subjectId) => getSubjectStatus(studentId, subjectId))
  );
}

/**
 * Walks a subject's skill tree for one student and returns the set of
 * skill/sub-skill ids that should be auto-revealed because they (or an
 * ancestor along the same branch) failed: a node's children only get
 * auto-expanded when that node's own attempt is "fail" and it has
 * children to drill into. Passed or unattempted nodes never auto-expand.
 * @param {string|null} studentId
 * @param {{ skills: object[] } | null} subject - result of getSubjectSkillSummary
 * @returns {Set<string>}
 */
export function getAutoExpandIds(studentId, subject) {
  const expandIds = new Set();
  if (!studentId || !subject) return expandIds;

  function walk(skillId) {
    const skill = getSkill(skillId);
    if (!skill) return;
    const status = getSkillStatus(studentId, skillId);
    if (status === 'fail' && (skill.subSkillIds || []).length > 0) {
      expandIds.add(skillId);
      for (const subId of skill.subSkillIds) walk(subId);
    }
  }

  subject.skills.forEach((skill) => walk(skill.id));
  return expandIds;
}
