import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { getStandard } from '../lib/graphStore.js';
import { getStandardSubjectSummaries, getNextStandardOptions } from '../lib/traverse.js';
import { getStandardStatus, getSubjectStatus } from '../lib/attempts.js';
import {
  COLOR_ACCENT_STANDARD,
  COLOR_ACCENT_SUBJECT,
  COLOR_ACCENT_PASS,
  COLOR_ACCENT_FAIL,
  COLOR_ACCENT_IMPROVE,
  COLOR_ACCENT_LINK,
  COLOR_PANEL_BORDER,
  COLOR_EDGE_DEFAULT,
  COLOR_PANEL,
  COLOR_INK,
  KIND_OUTLINE_COLOR,
  NODE_LABEL_BASE_STYLE,
} from '../lib/theme.js';

cytoscape.use(dagre);

const SUBJECTS_LABEL_KIND = 'subjects-label';

const STATUS_ICON = { pass: '✅', fail: '❌', unattempted: '–' };

function statusLabel(baseLabel, studentId, status) {
  if (!studentId) return baseLabel;
  return `${STATUS_ICON[status] || ''} ${baseLabel}`;
}

/**
 * Builds the progressive-reveal element set for a Standard's breakdown.
 *
 * revealStep 0: only the Standard node.
 * revealStep 1: + a "Subjects" grouping node hanging off the Standard.
 * revealStep 2: + every Subject node fanning out under "Subjects", and
 *               (if one exists) the next Standard in the chain, with every
 *               Subject node's edge converging into it.
 *
 * When a studentId is supplied, the Standard node and every Subject node
 * carry a `status` data field ("pass" | "fail" | "unattempted") plus a
 * ✅/❌/– prefix baked into their label, reflecting that student's
 * aggregate mastery under this branch.
 */
function buildElements(standardId, revealStep, studentId) {
  const standard = getStandard(standardId);
  if (!standard) return [];

  const standardStatus = studentId ? getStandardStatus(studentId, standardId) : 'none';
  const elements = [
    {
      data: {
        id: standard.id,
        label: statusLabel(standard.code, studentId, standardStatus),
        kind: 'standard',
        status: standardStatus,
      },
    },
  ];

  if (revealStep < 1) return elements;

  const labelId = `${standard.id}::subjects-label`;
  elements.push({ data: { id: labelId, label: 'Subjects', kind: SUBJECTS_LABEL_KIND } });
  elements.push({
    data: { id: `${standard.id}->${labelId}`, source: standard.id, target: labelId },
  });

  if (revealStep < 2) return elements;

  const subjects = getStandardSubjectSummaries(standardId);
  const [nextStandard] = getNextStandardOptions(standardId);

  subjects.forEach((subject) => {
    const subjectStatus = studentId ? getSubjectStatus(studentId, subject.id) : 'none';
    elements.push({
      data: {
        id: subject.id,
        label: statusLabel(subject.name, studentId, subjectStatus),
        name: subject.name,
        kind: 'subject',
        status: subjectStatus,
      },
    });
    elements.push({
      data: { id: `${labelId}->${subject.id}`, source: labelId, target: subject.id },
    });

    if (nextStandard) {
      elements.push({
        data: {
          id: `${subject.id}->${nextStandard.id}`,
          source: subject.id,
          target: nextStandard.id,
          kind: 'converge',
        },
      });
    }
  });

  if (nextStandard) {
    elements.push({
      data: { id: nextStandard.id, label: nextStandard.code, kind: 'next-standard' },
    });
  }

  return elements;
}

/**
 * Middle panel: a click-to-reveal Cytoscape (dagre, top-down) tree showing
 * a Standard's Subjects and its progression into the next Standard.
 * Clicking a Subject node bubbles up so the right panel can drill into it.
 *
 * @param {object} props
 * @param {string|null} props.standardId
 * @param {string|null} [props.studentId] - active student; when set, drives status badges
 * @param {string|null} [props.focusSubjectId] - when set, force-fans-out subjects and
 *   highlights this one (used when jumping in from a cross-grade linked skill)
 * @param {(subjectId: string, subjectName: string) => void} props.onSelectSubject
 * @param {(standardId: string) => void} props.onAdvanceStandard - fired when the "next standard" node is clicked
 * @param {(node: {id: string, kind: string, label: string}|null) => void} [props.onLastTappedChange] -
 *   mirrors the last-tapped node up to the parent so it can render the
 *   "View full details" action in the panel heading instead of in-canvas
 */
export default function StandardGraph({
  standardId,
  studentId,
  focusSubjectId,
  onSelectSubject,
  onAdvanceStandard,
  onLastTappedChange,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const previousNodeIdsRef = useRef(new Set());
  const [revealStep, setRevealStep] = useState(0);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [rotation, setRotation] = useState(0);
  // Last tapped "real" node (standard or subject) — drives the small
  // "View full details" toolbar without touching any existing tap behavior.
  const [lastTapped, setLastTapped] = useState(null);

  // Reset progressive reveal + selection whenever a new standard is chosen.
  useEffect(() => {
    setRevealStep(0);
    setSelectedSubjectId(null);
    setLastTapped(null);
    previousNodeIdsRef.current = new Set();
  }, [standardId]);

  // Mirror the last-tapped node up to the parent (App renders the "View
  // full details" action in the panel heading from this).
  useEffect(() => {
    if (typeof onLastTappedChange === 'function') {
      onLastTappedChange(lastTapped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTapped]);

  // When told to focus a specific subject (e.g. after jumping in from a
  // cross-grade linked skill), fan the subjects out and highlight it.
  useEffect(() => {
    if (!focusSubjectId) return;
    setRevealStep((step) => Math.max(step, 2));
    setSelectedSubjectId(focusSubjectId);
  }, [standardId, focusSubjectId]);

  useEffect(() => {
    if (!containerRef.current || !standardId) return undefined;

    const elements = buildElements(standardId, revealStep, studentId);
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
            'text-max-width': '74px',
            'font-size': 11,
            'font-weight': 600,
            width: 100,
            height: 100,
            shape: 'ellipse',
            'background-color': COLOR_ACCENT_SUBJECT,
            'text-outline-color': KIND_OUTLINE_COLOR.subject,
            'border-width': 0,
          },
        },
        {
          selector: `node[kind = "${SUBJECTS_LABEL_KIND}"]`,
          style: {
            shape: 'round-rectangle',
            width: 132,
            height: 44,
            'background-color': COLOR_PANEL,
            'border-width': 1.5,
            'border-color': COLOR_PANEL_BORDER,
            color: COLOR_INK,
            'text-outline-width': 0,
            'font-weight': 700,
            'font-size': 11,
            'text-transform': 'uppercase',
          },
        },
        {
          selector: 'node[kind = "subject"]',
          style: {
            'background-color': COLOR_ACCENT_SUBJECT,
            'text-outline-color': KIND_OUTLINE_COLOR.subject,
          },
        },
        {
          selector: 'node[status = "pass"]',
          style: { 'border-width': 4, 'border-color': COLOR_ACCENT_PASS },
        },
        {
          selector: 'node[status = "fail"]',
          style: { 'border-width': 4, 'border-color': COLOR_ACCENT_FAIL },
        },
        {
          selector: 'node[status = "unattempted"]',
          style: { 'border-width': 3, 'border-color': COLOR_ACCENT_IMPROVE, 'border-style': 'dashed' },
        },
        {
          selector: 'node[kind = "subject"].is-selected',
          style: { 'border-width': 4, 'border-color': COLOR_ACCENT_LINK },
        },
        {
          selector: 'node[kind = "standard"]',
          style: {
            'background-color': COLOR_ACCENT_STANDARD,
            'text-outline-color': KIND_OUTLINE_COLOR.standard,
            'font-family': 'JetBrains Mono, monospace',
            width: 124,
            height: 124,
            'font-size': 12.5,
            'font-weight': 700,
            'text-max-width': '92px',
          },
        },
        {
          selector: 'node[kind = "next-standard"]',
          style: {
            'background-color': COLOR_ACCENT_STANDARD,
            'text-outline-color': KIND_OUTLINE_COLOR.standard,
            'font-family': 'JetBrains Mono, monospace',
            width: 112,
            height: 112,
            'text-max-width': '82px',
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
          selector: 'edge[kind = "converge"]',
          style: { 'line-color': COLOR_ACCENT_LINK, 'target-arrow-color': COLOR_ACCENT_LINK, width: 2.5 },
        },
      ],
      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 36,
        rankSep: 80,
      },
    });

    cy.on('tap', 'node', (evt) => {
      const data = evt.target.data();
      if (data.kind === 'standard') {
        setRevealStep((step) => Math.max(step, 1));
        setLastTapped({ id: data.id, kind: 'standard', label: data.label });
      } else if (data.kind === SUBJECTS_LABEL_KIND) {
        setRevealStep((step) => Math.max(step, 2));
      } else if (data.kind === 'subject') {
        setSelectedSubjectId(data.id);
        setLastTapped({ id: data.id, kind: 'subject', label: data.name || data.label });
        if (typeof onSelectSubject === 'function') {
          onSelectSubject(data.id, data.name || data.label);
        }
      } else if (data.kind === 'next-standard') {
        setLastTapped({ id: data.id, kind: 'standard', label: data.label });
        if (typeof onAdvanceStandard === 'function') {
          onAdvanceStandard(data.id);
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
  }, [standardId, revealStep, studentId]);

  // Keep the selected-subject highlight in sync without rebuilding the graph.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes('[kind = "subject"]').forEach((node) => {
      node.toggleClass('is-selected', node.id() === selectedSubjectId);
    });
  }, [selectedSubjectId]);

  const getFocusRenderedPosition = () => {
    const cy = cyRef.current;
    if (!cy) return { x: 0, y: 0 };
    if (selectedSubjectId) {
      const node = cy.getElementById(selectedSubjectId);
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

  if (!standardId) {
    return (
      <div className="empty-panel">Select a standard on the left to explore its breakdown.</div>
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
        Click the standard to reveal its subjects, then click "Subjects" to fan them out and see
        what this standard builds toward. Click a subject to explore its skills on the right.
      </p>
    </div>
  );
}
