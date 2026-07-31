import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { getStandard } from '../lib/graphStore.js';
import { getSkillOwner } from '../lib/traverse.js';
import {
  COLOR_ACCENT_STANDARD,
  COLOR_ACCENT_SUBJECT,
  COLOR_ACCENT_SKILL,
  COLOR_ACCENT_LINK,
  COLOR_INK_MUTED,
  COLOR_PANEL_BORDER,
  COLOR_EDGE_DEFAULT,
  KIND_OUTLINE_COLOR,
  NODE_LABEL_BASE_STYLE,
} from '../lib/theme.js';

const KIND_COLOR = {
  standard: COLOR_ACCENT_STANDARD,
  subject: COLOR_ACCENT_SUBJECT,
  skill: COLOR_ACCENT_SKILL,
};

const HALO_SUFFIX_OUTER = '::halo-outer';
const HALO_SUFFIX_INNER = '::halo-inner';

/**
 * Builds a flat "hub and spoke" element set: the current node at the
 * center, plus one node per relation resolved by getNodeDetail — every
 * relation connected with a single, directly-labeled edge (no multi-hop
 * chaining) so a `concentric` layout renders a clean single ring around
 * the center, matching the constellation/radial reference design.
 */
function buildElements(detail) {
  const {
    kind,
    id,
    name,
    parentChain,
    children,
    prerequisites,
    linkedSkill,
    reverseLinkedSkills,
    buildsFrom,
    buildsToward,
  } = detail;

  const elements = [
    {
      data: { id: `${id}${HALO_SUFFIX_OUTER}`, isHalo: true },
      selectable: false,
      grabbable: false,
      classes: 'halo-node halo-outer',
    },
    {
      data: { id: `${id}${HALO_SUFFIX_INNER}`, isHalo: true },
      selectable: false,
      grabbable: false,
      classes: 'halo-node halo-inner',
    },
    { data: { id, label: name, kind, isCenter: true } },
  ];
  const seen = new Set([id]);

  function addNode(item) {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    elements.push({ data: { id: item.id, label: item.label, kind: item.kind } });
  }

  function addEdge(sourceId, targetId, edgeKind, label) {
    elements.push({
      data: {
        id: `${sourceId}->${targetId}::${edgeKind}::${elements.length}`,
        source: sourceId,
        target: targetId,
        kind: edgeKind,
        label,
      },
    });
  }

  // Every relation is wired as a single direct spoke to/from the center
  // node — this is what makes the `concentric` layout below produce one
  // clean surrounding ring instead of a multi-level tree.
  parentChain.forEach((item) => {
    addNode(item);
    let label = 'has parent';
    if (item.kind === 'subject') label = 'in subject';
    else if (item.kind === 'standard') label = 'in standard';
    addEdge(id, item.id, 'parent', label);
  });

  children.forEach((item) => {
    addNode(item);
    addEdge(id, item.id, 'child', 'has child');
  });

  prerequisites.forEach((item) => {
    addNode(item);
    addEdge(item.id, id, 'prerequisite', 'prerequisite of');
  });

  if (linkedSkill) {
    addNode(linkedSkill);
    const owner = getSkillOwner(linkedSkill.id);
    const ownerStandard = owner ? getStandard(owner.standardId) : null;
    const label = ownerStandard ? `linked (grade ${ownerStandard.grade})` : 'linked to';
    addEdge(id, linkedSkill.id, 'linked-skill', label);
  }

  reverseLinkedSkills.forEach((item) => {
    addNode(item);
    const owner = getSkillOwner(item.id);
    const ownerStandard = owner ? getStandard(owner.standardId) : null;
    const label = ownerStandard ? `linked (grade ${ownerStandard.grade})` : 'linked from';
    addEdge(item.id, id, 'linked-skill', label);
  });

  buildsFrom.forEach((item) => {
    addNode(item);
    addEdge(item.id, id, 'progression', 'builds from');
  });

  buildsToward.forEach((item) => {
    addNode(item);
    addEdge(id, item.id, 'progression', 'builds toward');
  });

  return elements;
}

/**
 * Radial "constellation" view for the Node Detail page: the current node
 * sits at the center (with a soft layered glow behind it) and every
 * related node resolved by getNodeDetail — parent chain, children,
 * prerequisites, cross-grade links, grade progression — fans out around
 * it in a single ring via Cytoscape's built-in `concentric` layout, with
 * each connecting edge labeled with the relation it represents. Clicking
 * any non-center node re-centers the whole page on it via onNavigate.
 *
 * @param {object} props
 * @param {object} props.detail - the object returned by lib/traverse.js getNodeDetail
 * @param {(kind: string, id: string) => void} props.onNavigate
 */
export default function NodeDetailGraph({ detail, onNavigate }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !detail) return undefined;

    const elements = buildElements(detail);
    const haloOuterId = `${detail.id}${HALO_SUFFIX_OUTER}`;
    const haloInnerId = `${detail.id}${HALO_SUFFIX_INNER}`;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      maxZoom: 2.5,
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
            'text-max-width': '78px',
            'font-size': 10.5,
            'font-weight': 600,
            width: 84,
            height: 84,
            shape: 'ellipse',
            'background-color': COLOR_INK_MUTED,
            'text-outline-color': '#2b3345',
            'z-index': 5,
          },
        },
        {
          selector: 'node[kind = "standard"]',
          style: {
            'background-color': KIND_COLOR.standard,
            'text-outline-color': KIND_OUTLINE_COLOR.standard,
            'font-family': 'JetBrains Mono, monospace',
          },
        },
        {
          selector: 'node[kind = "subject"]',
          style: { 'background-color': KIND_COLOR.subject, 'text-outline-color': KIND_OUTLINE_COLOR.subject },
        },
        {
          selector: 'node[kind = "skill"]',
          style: { 'background-color': KIND_COLOR.skill, 'text-outline-color': KIND_OUTLINE_COLOR.skill },
        },
        {
          selector: 'node[?isCenter]',
          style: {
            width: 128,
            height: 128,
            'font-size': 13,
            'font-weight': 700,
            'text-max-width': '108px',
            'border-width': 4,
            'border-color': COLOR_ACCENT_LINK,
            'z-index': 20,
          },
        },
        {
          selector: '.halo-node',
          style: {
            shape: 'ellipse',
            label: '',
            events: 'no',
            'overlay-opacity': 0,
            'border-width': 0,
            'z-index': 1,
          },
        },
        {
          selector: '.halo-outer',
          style: { width: 210, height: 210, 'background-color': COLOR_ACCENT_LINK, 'background-opacity': 0.08 },
        },
        {
          selector: '.halo-inner',
          style: { width: 165, height: 165, 'background-color': COLOR_ACCENT_LINK, 'background-opacity': 0.14 },
        },
        {
          selector: 'edge',
          style: {
            width: 1.6,
            'line-color': COLOR_EDGE_DEFAULT,
            'target-arrow-color': COLOR_EDGE_DEFAULT,
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.8,
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 10,
            'font-weight': 600,
            'font-family': 'Inter, system-ui, sans-serif',
            color: '#f8fafc',
            'text-background-color': '#0B1120',
            'text-background-opacity': 0.95,
            'text-background-padding': 3,
            'text-rotation': 'autorotate',
          },
        },
        {
          selector: 'edge[kind = "prerequisite"]',
          style: { 'line-color': COLOR_ACCENT_STANDARD, 'target-arrow-color': COLOR_ACCENT_STANDARD },
        },
        {
          selector: 'edge[kind = "linked-skill"]',
          style: {
            'line-color': COLOR_ACCENT_LINK,
            'target-arrow-color': COLOR_ACCENT_LINK,
            'line-style': 'dotted',
          },
        },
        {
          selector: 'edge[kind = "progression"]',
          style: { 'line-color': COLOR_ACCENT_SUBJECT, 'target-arrow-color': COLOR_ACCENT_SUBJECT, width: 2 },
        },
      ],
      // Halo nodes are positioned manually (see syncHaloPositions below), not
      // via layout — they'd otherwise form their own concentric ring outside
      // (or inside) the real relation ring since they carry a distinct
      // concentric "value" of their own.
      layout: { name: 'preset' },
    });

    const realElements = cy.elements().not('.halo-node');

    // Keep the layered glow halos pinned exactly on top of the center node
    // at all times (initial layout, drags, zoom/pan don't move node
    // positions, but re-layout on data change does).
    function syncHaloPositions() {
      const center = cy.getElementById(detail.id);
      if (!center.length) return;
      const pos = center.position();
      cy.getElementById(haloOuterId).position(pos);
      cy.getElementById(haloInnerId).position(pos);
    }

    cy.getElementById(detail.id).on('position', syncHaloPositions);

    const concentricLayout = realElements.layout({
      name: 'concentric',
      concentric(node) {
        return node.data('isCenter') ? 2 : 1;
      },
      levelWidth: () => 1,
      minNodeSpacing: 70,
      equidistant: true,
      animate: false,
      fit: false,
    });
    concentricLayout.on('layoutstop', () => {
      syncHaloPositions();
      cy.fit(realElements, 60);
    });
    concentricLayout.run();

    cy.on('tap', 'node', (evt) => {
      const data = evt.target.data();
      if (data.isCenter || data.isHalo) return;
      if (typeof onNavigate === 'function') {
        onNavigate(data.kind, data.id);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [detail, onNavigate]);

  const handleZoom = (factor) => {
    const cy = cyRef.current;
    if (!cy) return;
    const targetZoom = Math.min(Math.max(cy.zoom() * factor, cy.minZoom()), cy.maxZoom());
    cy.animate(
      { zoom: { level: targetZoom, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } },
      { duration: 150 }
    );
  };

  const handleFit = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.animate({ fit: { eles: cy.elements().not('.halo-node'), padding: 60 } }, { duration: 200 });
  };

  return (
    <div className="graph-canvas-wrapper">
      <div ref={containerRef} className="graph-canvas node-detail-graph-canvas" />
      <div className="graph-controls">
        <button type="button" className="graph-control-btn" onClick={() => handleZoom(1.2)} aria-label="Zoom in" title="Zoom in">
          +
        </button>
        <button type="button" className="graph-control-btn" onClick={() => handleZoom(1 / 1.2)} aria-label="Zoom out" title="Zoom out">
          −
        </button>
        <button type="button" className="graph-control-btn" onClick={handleFit} aria-label="Reset zoom and fit" title="Reset / fit">
          ⤢
        </button>
      </div>
    </div>
  );
}
