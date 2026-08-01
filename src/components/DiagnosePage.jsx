import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { getSavedStudents, saveStudent } from '../lib/students.js';
import GraphLegend from './GraphLegend.jsx';
import { getAllStandards, gradeLabel } from '../lib/graphStore.js';
import {
  getStandardBreakdown,
  getRemediationPath,
  getSubSkills,
  getStandardSubjectSummaries,
  getSubjectSkillSummary,
} from '../lib/traverse.js';
import { getSkillStatus, setSkillStatusOverride } from '../lib/attempts.js';

const TICKABLE_KINDS = new Set(['center-skill', 'sibling-skill', 'grade-skill', 'subskill']);

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
import {
  COLOR_ACCENT_STANDARD,
  COLOR_ACCENT_SKILL,
  COLOR_ACCENT_PASS,
  COLOR_ACCENT_PARTIAL,
  COLOR_ACCENT_FAIL,
  COLOR_ACCENT_IMPROVE,
  COLOR_EDGE_DEFAULT,
  COLOR_PANEL,
  NODE_LABEL_BASE_STYLE,
} from '../lib/theme.js';

cytoscape.use(dagre);

const STATUS_BORDER = {
  pass: COLOR_ACCENT_PASS,
  partial: COLOR_ACCENT_PARTIAL,
  fail: COLOR_ACCENT_FAIL,
  unattempted: COLOR_ACCENT_IMPROVE,
};

const DIAGNOSE_LEGEND = [
  { kind: 'node', color: COLOR_ACCENT_STANDARD, label: 'Earlier-grade standard (review)' },
  { kind: 'node', color: COLOR_ACCENT_SKILL, label: 'Skill (this student)' },
  { kind: 'line', color: COLOR_EDGE_DEFAULT, lineStyle: 'solid', label: 'Structure' },
  { kind: 'border', color: COLOR_ACCENT_PASS, lineStyle: 'solid', label: 'Passed' },
  { kind: 'border', color: COLOR_ACCENT_PARTIAL, lineStyle: 'solid', label: 'Partially good' },
  { kind: 'border', color: COLOR_ACCENT_FAIL, lineStyle: 'solid', label: 'Failed — focus here' },
  { kind: 'border', color: COLOR_ACCENT_IMPROVE, lineStyle: 'dashed', label: 'Unattempted' },
];

/**
 * Recursively appends a skill (or sub-skill) node, its edge from `parentId`,
 * and — if it's in `expandedIds` and has sub-skills — its expanded children
 * too. `kind` controls border weight/legend grouping; every kind used here
 * is tickable (see TICKABLE_KINDS).
 */
function addSkillNode(elements, skillObj, parentId, kind, studentId, expandedIds) {
  const hasChildren = (skillObj.subSkillIds || []).length > 0;
  elements.push({
    data: {
      id: skillObj.id,
      label: skillObj.name,
      kind,
      status: getSkillStatus(studentId, skillObj.id),
      hasChildren,
    },
  });
  if (parentId) {
    elements.push({ data: { id: `${parentId}->${skillObj.id}`, source: parentId, target: skillObj.id } });
  }
  if (hasChildren && expandedIds.has(skillObj.id)) {
    getSubSkills(skillObj.id).forEach((sub) => addSkillNode(elements, sub, skillObj.id, 'subskill', studentId, expandedIds));
  }
}

function buildElements(path, studentId, expandedIds) {
  const elements = [];
  if (!path.subjectId) {
    addSkillNode(elements, path.skill, null, 'center-skill', studentId, expandedIds);
    return elements;
  }

  elements.push({ data: { id: path.subjectId, label: path.subjectName || 'Subject', kind: 'subject-hub' } });

  addSkillNode(elements, path.skill, path.subjectId, 'center-skill', studentId, expandedIds);
  path.siblings.forEach((sib) => addSkillNode(elements, sib, path.subjectId, 'sibling-skill', studentId, expandedIds));

  let prevId = path.subjectId;
  path.gradeChain.forEach((std) => {
    elements.push({
      data: { id: std.id, label: `${std.code}\n(${gradeLabel(std.grade)})`, kind: 'grade-standard', hasChildren: true },
    });
    elements.push({ data: { id: `${prevId}->${std.id}`, source: prevId, target: std.id, kind: 'grade-edge' } });

    if (expandedIds.has(std.id)) {
      getStandardSubjectSummaries(std.id).forEach((subj) => {
        const subjHubId = `${std.id}::${subj.id}`;
        const fullSubject = getSubjectSkillSummary(subj.id);
        elements.push({ data: { id: subjHubId, label: subj.name, kind: 'grade-subject-hub' } });
        elements.push({ data: { id: `${std.id}->${subjHubId}`, source: std.id, target: subjHubId } });
        (fullSubject ? fullSubject.skills : []).forEach((sk) =>
          addSkillNode(elements, sk, subjHubId, 'grade-skill', studentId, expandedIds)
        );
      });
    }

    prevId = std.id;
  });

  return elements;
}

/**
 * Teacher-facing diagnostic tool: pick a student + standard + the specific
 * skill they're failing, mark it failing, and see a backtrack graph built
 * from real data — sibling skills in the same Subject (foundational pieces
 * worth shoring up alongside it) plus the Standard's real grade-progression
 * chain (earlier-grade material worth reviewing). Hover any skill node to
 * tick (mark passed) or cross (mark failed) it — persists per student via
 * the same override system used elsewhere in the app.
 *
 * @param {object} props
 * @param {() => void} props.onBack
 */
export default function DiagnosePage({ onBack }) {
  const [studentName, setStudentName] = useState('');
  const [saveThisStudent, setSaveThisStudent] = useState(true);
  const [standardQuery, setStandardQuery] = useState('');
  const [standardId, setStandardId] = useState(null);
  const [skillId, setSkillId] = useState(null);
  const [path, setPath] = useState(null);
  const [overrideVersion, setOverrideVersion] = useState(0);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const savedStudents = useMemo(() => getSavedStudents(), [overrideVersion]);

  const studentId = useMemo(() => {
    const trimmed = studentName.trim();
    if (!trimmed) return null;
    const known = savedStudents.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    return known ? known.id : `student-custom-${slugify(trimmed)}`;
  }, [studentName, savedStudents]);

  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [hover, setHover] = useState(null); // { id, x, y } | null

  const allStandards = useMemo(() => getAllStandards(), []);
  const matchingStandards = useMemo(() => {
    const q = standardQuery.trim().toLowerCase();
    if (!q) return [];
    return allStandards
      .filter((s) => s.code.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      .slice(0, 20);
  }, [standardQuery, allStandards]);

  const breakdown = useMemo(() => (standardId ? getStandardBreakdown(standardId) : null), [standardId]);

  const canSubmit = studentId && skillId;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (saveThisStudent) {
      saveStudent({ id: studentId, name: studentName.trim() });
    }
    setSkillStatusOverride(studentId, skillId, 'fail');
    setOverrideVersion((v) => v + 1);
    setExpandedIds(new Set());
    setPath(getRemediationPath(skillId));
  };

  useEffect(() => {
    if (!containerRef.current || !path) return undefined;

    const elements = buildElements(path, studentId, expandedIds);

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      maxZoom: 2,
      minZoom: 0.2,
      style: [
        {
          selector: 'node',
          style: {
            ...NODE_LABEL_BASE_STYLE,
            label: 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '70px',
            'font-size': 10.5,
            'font-weight': 600,
            width: 92,
            height: 92,
            shape: 'ellipse',
            'background-color': COLOR_ACCENT_SKILL,
          },
        },
        {
          selector: 'node[kind = "subject-hub"]',
          style: {
            shape: 'round-rectangle',
            width: 140,
            height: 44,
            'background-color': COLOR_PANEL,
            color: '#E5E9F0',
            'text-outline-width': 0,
            'font-weight': 700,
            'text-max-width': '120px',
          },
        },
        {
          selector: 'node[kind = "grade-standard"]',
          style: {
            'background-color': COLOR_ACCENT_STANDARD,
            'font-family': 'JetBrains Mono, monospace',
            width: 96,
            height: 96,
          },
        },
        {
          selector: 'node[kind = "grade-subject-hub"]',
          style: {
            shape: 'round-rectangle',
            width: 130,
            height: 40,
            'background-color': COLOR_PANEL,
            color: '#E5E9F0',
            'text-outline-width': 0,
            'font-weight': 700,
            'font-size': 9.5,
            'text-max-width': '112px',
          },
        },
        {
          selector: 'node[kind = "center-skill"]',
          style: { 'border-width': 5 },
        },
        {
          selector: 'node[kind = "sibling-skill"], node[kind = "grade-skill"]',
          style: { 'border-width': 4 },
        },
        {
          selector: 'node[kind = "subskill"]',
          style: { 'border-width': 3, width: 76, height: 76, 'font-size': 9.5 },
        },
        {
          selector: 'node[?hasChildren]',
          style: { 'border-width': 3 },
        },
        ...Object.entries(STATUS_BORDER).map(([status, color]) => ({
          selector: `node[status = "${status}"]`,
          style: {
            'border-color': color,
            'border-style': status === 'unattempted' ? 'dashed' : 'solid',
          },
        })),
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': COLOR_EDGE_DEFAULT,
            'target-arrow-color': COLOR_EDGE_DEFAULT,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
        {
          selector: 'edge[kind = "grade-edge"]',
          style: { 'line-color': COLOR_ACCENT_STANDARD, 'target-arrow-color': COLOR_ACCENT_STANDARD, width: 2.5 },
        },
      ],
      layout: { name: 'dagre', rankDir: 'TB', nodeSep: 26, rankSep: 70 },
    });

    const showHoverControls = (node) => {
      const kind = node.data('kind');
      if (!TICKABLE_KINDS.has(kind)) return;
      const pos = node.renderedPosition();
      setHover({ id: node.id(), x: pos.x, y: pos.y });
    };

    cy.on('mouseover', 'node', (evt) => showHoverControls(evt.target));
    cy.on('mouseout', 'node', () => setHover(null));
    cy.on('pan zoom position', () => setHover(null));

    cy.on('tap', 'node', (evt) => {
      const data = evt.target.data();
      if (!data.hasChildren) return;
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(data.id)) next.delete(data.id);
        else next.add(data.id);
        return next;
      });
      setHover(null);
    });

    cy.fit(undefined, 40);
    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, studentId, overrideVersion, expandedIds]);

  const handleMark = (nodeId, status) => {
    setSkillStatusOverride(studentId, nodeId, status);
    setOverrideVersion((v) => v + 1);
    setHover(null);
  };

  return (
    <div className="diagnose-page">
      <button type="button" className="node-detail-back-btn" onClick={onBack}>
        ← Back to explorer
      </button>

      <section className="diagnose-form panel">
        <h2 className="panel-title">Diagnose a student</h2>
        <p className="graph-hint">
          Pick the student and the exact skill they're failing. This marks it failing for that
          student and builds a backtrack graph — the same Subject's other skills, plus the real
          earlier-grade standards this one builds from — so you can see what to review.
        </p>

        <div className="diagnose-field">
          <span className="field-label">Student name</span>
          <input
            type="text"
            className="standard-input"
            value={studentName}
            onChange={(evt) => setStudentName(evt.target.value)}
            placeholder="Type any student's name — e.g. Jordan Lee"
          />
          {savedStudents.length > 0 && (
            <div className="standard-quick-list" style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {savedStudents.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  className={`standard-chip${studentName === student.name ? ' is-active' : ''}`}
                  onClick={() => setStudentName(student.name)}
                >
                  {student.name}
                </button>
              ))}
            </div>
          )}
          <label className="diagnose-save-toggle" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={saveThisStudent}
              onChange={(evt) => setSaveThisStudent(evt.target.checked)}
            />
            Save this student for next time
          </label>
        </div>

        <div className="diagnose-field">
          <span className="field-label">Standard (search by code or description)</span>
          <input
            type="text"
            className="standard-input"
            value={standardQuery}
            onChange={(evt) => {
              setStandardQuery(evt.target.value);
              setStandardId(null);
              setSkillId(null);
              setPath(null);
            }}
            placeholder="e.g. 8.EE"
          />
          {matchingStandards.length > 0 && !standardId && (
            <ul className="standard-options" style={{ position: 'static', marginTop: 6 }}>
              {matchingStandards.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="standard-option"
                    onClick={() => {
                      setStandardId(s.id);
                      setStandardQuery(`${s.code} — ${s.jurisdiction}`);
                      setSkillId(null);
                      setPath(null);
                    }}
                  >
                    <span className="standard-option-top">
                      <span className="standard-option-code">{s.code}</span>
                      <span className="standard-option-grade">
                        {gradeLabel(s.grade)} · {s.jurisdiction}
                      </span>
                    </span>
                    <span className="standard-option-desc">{s.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {breakdown && (
          <div className="diagnose-field">
            <span className="field-label">Failing skill</span>
            <select
              className="standard-picker-select"
              value={skillId || ''}
              onChange={(evt) => setSkillId(evt.target.value || null)}
            >
              <option value="">Choose a skill</option>
              {breakdown.subjects.map((subject) => (
                <optgroup key={subject.id} label={subject.name}>
                  {subject.skills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          className="node-detail-view-btn diagnose-submit-btn"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          Mark as failing & build path →
        </button>
      </section>

      {path && (
        <section className="panel panel-graph diagnose-graph-panel">
          <div className="panel-title-row">
            <h2 className="panel-title">Backtrack path — {path.skill.name}</h2>
          </div>
          <div className="graph-canvas-wrapper" style={{ position: 'relative' }}>
            <div ref={containerRef} className="graph-canvas" />
            {hover && (
              <div
                className="diagnose-hover-controls"
                style={{ left: hover.x, top: hover.y }}
                onMouseLeave={() => setHover(null)}
              >
                <button
                  type="button"
                  className="diagnose-hover-btn diagnose-hover-pass"
                  title="Mark passed"
                  onClick={() => handleMark(hover.id, 'pass')}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="diagnose-hover-btn diagnose-hover-fail"
                  title="Mark failed"
                  onClick={() => handleMark(hover.id, 'fail')}
                >
                  ✗
                </button>
              </div>
            )}
          </div>
          <p className="graph-hint">
            Hover a skill node for tick/cross — tick marks it passed (green), cross marks it
            failed (red) — persists for this student. Nodes with a thick outline (skills and
            earlier-grade standards) can be clicked to expand and reveal their own skills and
            sub-skills, which are tickable too.
          </p>
          <GraphLegend items={DIAGNOSE_LEGEND} />
        </section>
      )}
    </div>
  );
}
