import { getSavedStudents } from '../lib/students.js';

/**
 * Compact chip-list picker for the active student, mirroring the visual
 * language of StandardSelector's quick-list chips. Selecting a student
 * drives the pass/fail badges (and auto-diagnostic drill) shown in both
 * graph panels; selecting "None" clears badges entirely.
 *
 * @param {object} props
 * @param {string|null} props.selectedId
 * @param {(id: string|null) => void} props.onSelect
 */
export default function StudentSelector({ selectedId, onSelect }) {
  const studentsData = getSavedStudents();
  return (
    <div className="student-selector">
      <span className="field-label">Track a student</span>
      <ul className="student-chip-list">
        <li>
          <button
            type="button"
            className={`student-chip${selectedId === null ? ' is-active' : ''}`}
            onClick={() => onSelect(null)}
          >
            None
          </button>
        </li>
        {studentsData.map((student) => (
          <li key={student.id}>
            <button
              type="button"
              className={`student-chip${student.id === selectedId ? ' is-active' : ''}`}
              onClick={() => onSelect(student.id)}
            >
              {student.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
