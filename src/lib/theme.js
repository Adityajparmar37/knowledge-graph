/**
 * Single source of truth for the dark "knowledge graph" theme's color
 * palette, mirrored 1:1 from the CSS custom properties in index.css.
 * Cytoscape styles can't reference CSS variables directly, so every graph
 * component (StandardGraph, SubjectSkillGraph, NodeDetailGraph) imports its
 * node/edge colors from here instead of hardcoding hex values, keeping the
 * canvas rendering and the surrounding HTML/CSS chrome in lock-step.
 */

/** Dark navy — used as the high-contrast "ink" color for text sitting on
 * bright accent fills (badges, active chips, node labels), and as the fill
 * for dark "structural" container nodes (Subjects label, Subject/Skill
 * root nodes) which stay dark regardless of the overall page theme. */
export const COLOR_VOID = '#0B1120';
export const COLOR_PANEL = '#111827';
export const COLOR_PANEL_BORDER = '#1E293B';
export const COLOR_GRID_LINE = '#1E293B';
/** Default (non-accent) edge color — needs its own value distinct from
 * COLOR_PANEL_BORDER so edges stay visible against a light canvas. */
export const COLOR_EDGE_DEFAULT = '#94A3B8';
/** Light text color used ONLY for labels on dark structural node fills
 * (e.g. the "Subjects" node, COLOR_PANEL-filled nodes) — stays light
 * regardless of overall page theme since those nodes are always dark. */
export const COLOR_INK = '#E5E9F0';
export const COLOR_INK_MUTED = '#64748B';

/* Simple 3-category pastel palette: yellow = Standards, blue = Subjects,
   green = Skills/Sub-skills (a deeper shade of the same green for
   sub-skills, so hierarchy reads at a glance without adding more colors). */
export const COLOR_ACCENT_STANDARD = '#FDE68A';
export const COLOR_ACCENT_SUBJECT = '#BFDBFE';
export const COLOR_ACCENT_SKILL = '#BBF7D0';
export const COLOR_ACCENT_SUBSKILL = '#86EFAC';
export const COLOR_ACCENT_PASS = '#34D399';
export const COLOR_ACCENT_FAIL = '#F87171';
export const COLOR_ACCENT_LINK = '#FBBF24';
/** Purple — marks an unattempted node: not failed yet, but room to improve. */
export const COLOR_ACCENT_IMPROVE = '#A78BFA';
/** Orange — marks a "partial" attempt: neither a clean pass nor a fail,
 * some parts right and some wrong. */
export const COLOR_ACCENT_PARTIAL = '#FB923C';

export const KIND_COLOR = {
  standard: COLOR_ACCENT_STANDARD,
  subject: COLOR_ACCENT_SUBJECT,
  skill: COLOR_ACCENT_SKILL,
  subskill: COLOR_ACCENT_SUBSKILL,
  link: COLOR_ACCENT_LINK,
};

/** No longer used for a text-outline halo (removed — it muddied labels on
 * these light pastel fills, which have plenty of native contrast against
 * dark ink text on their own). Kept as a harmless no-op export so existing
 * `'text-outline-color': KIND_OUTLINE_COLOR.xxx` call sites don't need to
 * be touched — `NODE_LABEL_BASE_STYLE` now sets outline width to 0. */
export const KIND_OUTLINE_COLOR = {
  standard: COLOR_ACCENT_STANDARD,
  subject: COLOR_ACCENT_SUBJECT,
  skill: COLOR_ACCENT_SKILL,
  subskill: COLOR_ACCENT_SUBSKILL,
  link: COLOR_ACCENT_LINK,
};

/** Node label styling shared by every Cytoscape graph in the app: plain
 * dark ink text, no outline halo — these are light pastel fills so dark
 * text reads cleanly on its own. */
export const NODE_LABEL_BASE_STYLE = {
  color: COLOR_VOID,
  'text-outline-width': 0,
  'font-family': 'Inter, system-ui, sans-serif',
};
