import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { getSkillSummary, getSubSkills, getSubjectSkillSummary, getSkillOwner } from '../lib/traverse.js';
import { getStandard } from '../lib/graphStore.js';
import { getSkillStatus, getAutoExpandIds } from '../lib/attempts.js';
import InfoCard from './InfoCard.jsx';
import GraphLegend from './GraphLegend.jsx';
import {
  COLOR_ACCENT_SKILL,
  COLOR_ACCENT_SUBSKILL,
  COLOR_ACCENT_SUBJECT,
  COLOR_ACCENT_PASS,
  COLOR_ACCENT_FAIL,
  COLOR_ACCENT_IMPROVE,
  COLOR_ACCENT_LINK,
  COLOR_PANEL_BORDER,
  COLOR_EDGE_DEFAULT,
  COLOR_PANEL,
  KIND_OUTLINE_COLOR,
  NODE_LABEL_BASE_STYLE,
} from '../lib/theme.js';

cytoscape.use(dagre);

const STATUS_ICON = { pass: '✅', fail: '❌', unattempted: '–' };

const SUBJECT_SKILL_GRAPH_LEGEND = [
  { kind: 'node', color: COLOR_ACCENT_SUBJECT, label: 'Subject' },
  { kind: 'node', color: COLOR_ACCENT_SKILL, label: 'Skill' },
  { kind: 'node', color: COLOR_ACCENT_SUBSKILL, label: 'Sub-skill' },
  { kind: 'node', color: COLOR_ACCENT_LINK, shape: 'rect', label: 'Cross-grade link node' },
  { kind: 'line', color: COLOR_EDGE_DEFAULT, lineStyle: 'solid', label: 'Structure' },
  { kind: 'line', color: COLOR_ACCENT_LINK, lineStyle: 'dashed', label: 'Worked example' },
  { kind: 'line', color: COLOR_ACCENT_LINK, lineStyle: 'dotted', label: 'Cross-grade link' },
  { kind: 'border', color: COLOR_ACCENT_PASS, lineStyle: 'solid', label: 'Passed' },
  { kind: 'border', color: COLOR_ACCENT_FAIL, lineStyle: 'solid', label: 'Failed' },
  { kind: 'border', color: COLOR_ACCENT_IMPROVE, lineStyle: 'dashed', label: 'Unattempted' },
];

function statusLabel(baseLabel, studentId, status) {
  if (!studentId) return baseLabel;
  return `${STATUS_ICON[status] || ''} ${baseLabel}`;
}

/**
 * Builds the element set for the Subject -> Skill -> Sub-skill -> Info
 * drill-down. Skills are shown immediately under the Subject root; a
 * skill's (or sub-skill's) children only appear once that node's id is in
 * `expandedIds` — which may be there because the user clicked it, or
 * because it auto-cascaded open from a failed attempt. A skill/sub-skill
 * carrying a `linkedSkillId` also gets a small clickable "link" node
 * pointing at its cross-grade counterpart. An info box only appears once
 * a leaf node is clicked.
 */
function buildElements(subject, expandedIds, activeLeaf, studentId) {
  const elements = [
    { data: { id: subject.id, label: subject.name, kind: 'subject-root' } },
  ];
  const nodeIds = new Set([subject.id]);

  function addSkillNode(skill, parentId, depth) {
    const kind = depth === 0 ? 'skill' : 'subskill';
    const status = studentId ? getSkillStatus(studentId, skill.id) : 'none';
    elements.push({
      data: {
        id: skill.id,
        label: statusLabel(skill.name, studentId, status),
        kind,
        hasChildren: skill.subSkillIds.length > 0,
        status,
      },
    });
    nodeIds.add(skill.id);
    elements.push({
      data: { id: `${parentId}->${skill.id}`, source: parentId, target: skill.id },
    });

    if (skill.linkedSkillId) {
      const owner = getSkillOwner(skill.linkedSkillId);
      const ownerStandard = owner ? getStandard(owner.standardId) : null;
      const linkId = `${skill.id}::link`;
      elements.push({
        data: {
          id: linkId,
          label: `🔗 ${ownerStandard ? ownerStandard.code : 'related skill'}`,
          kind: 'link',
          targetSkillId: skill.linkedSkillId,
        },
      });
      elements.push({
        data: { id: `${skill.id}->${linkId}`, source: skill.id, target: linkId, kind: 'link-edge' },
      });
    }

    if (expandedIds.has(skill.id) && skill.subSkillIds.length > 0) {
      getSubSkills(skill.id).forEach((subSkill) => addSkillNode(subSkill, skill.id, depth + 1));
    }
  }

  subject.skills.forEach((skill) => addSkillNode(skill, subject.id, 0));

  // activeLeaf/expandedIds can briefly reference a node from a
  // previously-selected subject (state reset happens in an effect, one
  // render after the subjectId prop changes) — only wire up the info node
  // if its source actually exists in this subject's element set.
  if (activeLeaf && nodeIds.has(activeLeaf.id)) {
    const infoId = `${activeLeaf.id}::info`;
    elements.push({
      data: { id: infoId, label: activeLeaf.example || 'No example available', kind: 'info' },
    });
    elements.push({
      data: { id: `${activeLeaf.id}->${infoId}`, source: activeLeaf.id, target: infoId, kind: 'info-edge' },
    });
  }

  return elements;
}

/**
 * Right panel: click-to-expand Subject -> Skill -> Sub-skill drill-down.
 * The Subject's skills render as soon as it mounts; clicking a skill with
 * sub-skills toggles them open; clicking any leaf (a childless skill/sub-skill)
 * reveals an in-graph example node and populates the InfoCard below with
 * the full pass-criteria list.
 *
 * When a student is being tracked, every skill/sub-skill also carries a
 * ✅/❌/– status badge, and any node whose attempt is "fail" auto-reveals
 * its sub-skills (the auto-diagnostic drill), cascading further into any
 * of those that are themselves "fail" with children of their own. This
 * auto-expand set is re-walked whenever the subject or student changes,
 * and manual clicks toggle membership in the very same expanded-ids set on
 * top of it, so a passed skill still only opens when the user clicks it.
 *
 * @param {object} props
 * @param {string|null} props.subjectId
 * @param {string|null} [props.studentId] - active student; drives badges + auto-drill
 * @param {string|null} [props.focusSkillId] - when set, auto-selects this skill as the
 *   active leaf (used when jumping in from a cross-grade linked skill)
 * @param {(skillId: string) => void} [props.onJumpToLinkedSkill] - fired when a skill's
 *   cross-grade link node is clicked
 * @param {(node: {id: string, kind: string, label: string}|null) => void} [props.onLastTappedChange] -
 *   mirrors the last-tapped node up to the parent so it can render the
 *   "View full details" action in the panel heading instead of in-canvas
 */
export default function SubjectSkillGraph({
  subjectId,
  studentId,
  focusSkillId,
  onJumpToLinkedSkill,
  onLastTappedChange,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const previousNodeIdsRef = useRef(new Set());
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [activeLeafId, setActiveLeafId] = useState(null);
  const [rotation, setRotation] = useState(0);
  // Last tapped "real" node (subject root or skill/sub-skill) — drives the
  // small "View full details" toolbar without touching any existing tap behavior.
  const [lastTapped, setLastTapped] = useState(null);

  const subject = subjectId ? getSubjectSkillSummary(subjectId) : null;

  // Reset drill-down state whenever a new subject is selected, then seed
  // the auto-diagnostic cascade for whichever student is active (an empty
  // set if no student is selected).
  useEffect(() => {
    setExpandedIds(getAutoExpandIds(studentId, subject));
    setActiveLeafId(null);
    setLastTapped(null);
    previousNodeIdsRef.current = new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, studentId]);

  // Mirror the last-tapped node up to the parent (App renders the "View
  // full details" action in the panel heading from this).
  useEffect(() => {
    if (typeof onLastTappedChange === 'function') {
      onLastTappedChange(lastTapped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTapped]);

  // Jump-to-linked-skill support: once the target skill exists in this
  // subject's render, auto-select it as the active leaf so its example +
  // pass criteria surface immediately.
  useEffect(() => {
    if (!focusSkillId || !subject) return;
    if (subject.skills.some((skill) => skill.id === focusSkillId)) {
      setActiveLeafId(focusSkillId);
    }
  }, [focusSkillId, subject]);

  const activeLeaf = activeLeafId ? getSkillSummary(activeLeafId) : null;

  useEffect(() => {
    if (!containerRef.current || !subject) return undefined;

    const elements = buildElements(subject, expandedIds, activeLeaf, studentId);
    const currentNodeIds = new Set(
      elements.filter((el) => el.data.source === undefined).map((el) => el.data.id)
    );
    const previousNodeIds = previousNodeIdsRef.current;
    const isFirstRender = previousNodeIds.size === 0;
    const newNodeIds = [...currentNodeIds].filter((id) => !previousNodeIds.has(id));

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
            width: 96,
            height: 96,
            shape: 'ellipse',
            'background-color': COLOR_ACCENT_SKILL,
            'text-outline-color': KIND_OUTLINE_COLOR.skill,
          },
        },
        {
          selector: 'node[kind = "subject-root"]',
          style: {
            'background-color': COLOR_ACCENT_SUBJECT,
            'text-outline-color': KIND_OUTLINE_COLOR.subject,
            width: 116,
            height: 116,
            'font-size': 12,
            'font-weight': 700,
            'text-max-width': '86px',
          },
        },
        {
          selector: 'node[kind = "skill"]',
          style: { 'background-color': COLOR_ACCENT_SKILL, 'text-outline-color': KIND_OUTLINE_COLOR.skill },
        },
        {
          selector: 'node[kind = "skill"][?hasChildren]',
          style: { 'border-width': 3, 'border-color': '#EDE4FF', 'border-style': 'solid' },
        },
        {
          selector: 'node[kind = "subskill"]',
          style: {
            'background-color': COLOR_ACCENT_SUBSKILL,
            'text-outline-color': KIND_OUTLINE_COLOR.subskill,
            width: 82,
            height: 82,
            'font-size': 9.5,
            'text-max-width': '58px',
          },
        },
        {
          selector: 'node[status = "pass"]',
          style: { 'border-width': 4, 'border-color': COLOR_ACCENT_PASS, 'border-style': 'solid' },
        },
        {
          selector: 'node[status = "fail"]',
          style: { 'border-width': 4, 'border-color': COLOR_ACCENT_FAIL, 'border-style': 'solid' },
        },
        {
          selector: 'node[status = "unattempted"]',
          style: { 'border-width': 3, 'border-color': COLOR_ACCENT_IMPROVE, 'border-style': 'dashed' },
        },
        {
          selector: 'node[kind = "skill"].is-active, node[kind = "subskill"].is-active',
          style: { 'border-width': 4, 'border-color': COLOR_ACCENT_LINK },
        },
        {
          selector: 'node[kind = "info"]',
          style: {
            shape: 'round-rectangle',
            'background-color': COLOR_PANEL,
            'border-width': 1.5,
            'border-color': 'rgba(251, 191, 36, 0.45)',
            color: COLOR_ACCENT_LINK,
            'text-outline-width': 0,
            width: 150,
            height: 64,
            'font-size': 10,
            'font-weight': 600,
            'text-max-width': '132px',
          },
        },
        {
          selector: 'node[kind = "link"]',
          style: {
            shape: 'round-rectangle',
            'background-color': COLOR_ACCENT_LINK,
            'text-outline-color': KIND_OUTLINE_COLOR.link,
            'font-family': 'JetBrains Mono, monospace',
            width: 100,
            height: 42,
            'font-size': 10,
            'font-weight': 700,
            'text-max-width': '88px',
          },
        },
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
          selector: 'edge[kind = "info-edge"]',
          style: { 'line-color': COLOR_ACCENT_LINK, 'target-arrow-color': COLOR_ACCENT_LINK, 'line-style': 'dashed' },
        },
        {
          selector: 'edge[kind = "link-edge"]',
          style: { 'line-color': COLOR_ACCENT_SUBJECT, 'target-arrow-color': COLOR_ACCENT_SUBJECT, 'line-style': 'dotted' },
        },
      ],
      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 30,
        rankSep: 64,
      },
    });

    cy.on('tap', 'node', (evt) => {
      const data = evt.target.data();
      if (data.kind === 'skill' || data.kind === 'subskill') {
        setLastTapped({ id: data.id, kind: 'skill', label: data.label });
        if (data.hasChildren) {
          setExpandedIds((current) => {
            const next = new Set(current);
            if (next.has(data.id)) {
              next.delete(data.id);
            } else {
              next.add(data.id);
            }
            return next;
          });
          setActiveLeafId(null);
        } else {
          setActiveLeafId((current) => (current === data.id ? null : data.id));
        }
      } else if (data.kind === 'subject-root') {
        setLastTapped({ id: data.id, kind: 'subject', label: data.label });
      } else if (data.kind === 'link') {
        if (typeof onJumpToLinkedSkill === 'function' && data.targetSkillId) {
          onJumpToLinkedSkill(data.targetSkillId);
        }
      }
    });

    cy.on('layoutstop', () => {
      if (isFirstRender || newNodeIds.length === 0) {
        cy.fit(undefined, 40);
      } else {
        const newEles = cy.collection();
        newNodeIds.forEach((id) => {
          const ele = cy.getElementById(id);
          if (ele.length) newEles.merge(ele);
        });
        if (newEles.length > 0) {
          cy.animate({ fit: { eles: newEles, padding: 60 } }, { duration: 300 });
        } else {
          cy.fit(undefined, 40);
        }
      }
      previousNodeIdsRef.current = currentNodeIds;
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, expandedIds, activeLeafId, studentId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes('[kind = "skill"], [kind = "subskill"]').forEach((node) => {
      node.toggleClass('is-active', expandedIds.has(node.id()) || node.id() === activeLeafId);
    });
  }, [expandedIds, activeLeafId]);

  const getFocusRenderedPosition = () => {
    const cy = cyRef.current;
    if (!cy) return { x: 0, y: 0 };
    const focusId = activeLeafId || [...expandedIds][expandedIds.size - 1];
    if (focusId) {
      const node = cy.getElementById(focusId);
      if (node.length) return node.renderedPosition();
    }
    return { x: cy.width() / 2, y: cy.height() / 2 };
  };

  const handleZoom = (factor) => {
    const cy = cyRef.current;
    if (!cy) return;
    const targetZoom = Math.min(Math.max(cy.zoom() * factor, cy.minZoom()), cy.maxZoom());
    cy.animate(
      { zoom: { level: targetZoom, renderedPosition: getFocusRenderedPosition() } },
      { duration: 150 }
    );
  };

  const handleFit = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.animate({ fit: { eles: cy.elements(), padding: 40 } }, { duration: 200 });
  };

  const handleRotate = () => {
    setRotation((current) => (current + 90) % 360);
  };

  if (!subject) {
    return (
      <div className="empty-panel">Click a subject in the middle panel to see its skill tree.</div>
    );
  }

  return (
    <div>
      <div className="graph-canvas-wrapper">
        <div
          className="graph-canvas-rotator"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div ref={containerRef} className="graph-canvas" />
        </div>
        <div className="graph-controls">
          <button
            type="button"
            className="graph-control-btn"
            onClick={() => handleZoom(1.2)}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="graph-control-btn"
            onClick={() => handleZoom(1 / 1.2)}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="graph-control-btn"
            onClick={handleFit}
            aria-label="Reset zoom and fit"
            title="Reset / fit"
          >
            ⤢
          </button>
          <button
            type="button"
            className="graph-control-btn"
            onClick={handleRotate}
            aria-label="Rotate graph 90 degrees"
            title="Rotate"
          >
            ⟳
          </button>
        </div>
      </div>
      <p className="graph-hint">
        Click a skill to reveal its sub-skills, or click a leaf skill to see a worked example.
        {studentId
          ? ' Skills marked ❌ for the tracked student auto-drill into their sub-skills; 🔗 badges jump to a related skill in another grade.'
          : ' Track a student on the left to see pass/fail badges and auto-diagnostic drill-downs.'}
      </p>
      <GraphLegend items={SUBJECT_SKILL_GRAPH_LEGEND} />
      <InfoCard node={activeLeaf} />
    </div>
  );
}
