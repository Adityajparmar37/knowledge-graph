const SAVED_STUDENTS_KEY = 'ssx-saved-students';

/**
 * Students the teacher has chosen to keep (see DiagnosePage's save prompt).
 * Persisted in localStorage; reading is defensive so private-mode/quota
 * errors just fall back to an empty list.
 * @returns {{id: string, name: string}[]}
 */
export function getSavedStudents() {
  try {
    const raw = localStorage.getItem(SAVED_STUDENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Adds a student to the saved list, or updates their record (e.g.
 * lastSkillId) if already saved.
 * @param {{id: string, name: string, lastSkillId?: string}} student
 */
export function saveStudent(student) {
  if (!student?.id || !student?.name) return;
  try {
    const existing = getSavedStudents();
    const idx = existing.findIndex((s) => s.id === student.id);
    if (idx === -1) {
      existing.push(student);
    } else {
      existing[idx] = { ...existing[idx], ...student };
    }
    localStorage.setItem(SAVED_STUDENTS_KEY, JSON.stringify(existing));
  } catch {
    // Storage unavailable (private browsing, quota) — student just won't persist.
  }
}
