import { getNodeDetail } from '../lib/traverse.js';
import {
  getSkillAggregateStatus,
  getSkillStatus,
  getStandardStatus,
  getSubjectStatus,
} from '../lib/attempts.js';
import NodeDetailGraph from './NodeDetailGraph.jsx';

const STATUS_ICON = { pass: '✅', fail: '❌', unattempted: '–' };
const STATUS_LABEL = { pass: 'Passing', fail: 'Failing', unattempted: 'Unattempted' };
const KIND_LABEL = { standard: 'Standard', subject: 'Subject', skill: 'Skill / Sub-skill' };

function StatusBadge({ status }) {
  if (!status || status === 'none') return null;
  return (
    <span className={`node-detail-status node-detail-status-${status}`}>
      {STATUS_ICON[status] || ''} {STATUS_LABEL[status] || status}
    </span>
  );
}

/**
 * Standalone "everything about this node" page — a different view entirely
 * from the 3-panel explorer, reachable via the "View full details" button
 * that appears once a node is tapped in either graph. Resolves the full
 * parent chain, children, prerequisites, and bidirectional cross-grade
 * link for whichever Standard/Subject/Skill/Sub-skill is passed in, and
 * renders it all as one connected radial Cytoscape graph via
 * NodeDetailGraph (the primary visual on this page) alongside a compact
 * info strip for the node's own record, letting the user keep navigating
 * by clicking any connected graph node, which re-resolves this same page
 * around it.
 *
 * @param {object} props
 * @param {"standard"|"subject"|"skill"} props.kind
 * @param {string} props.id
 * @param {string|null} [props.studentId] - active tracked student, for status badges
 * @param {(kind: string, id: string) => void} props.onNavigate
 * @param {() => void} props.onBack
 */
export default function NodeDetailPage({ kind, id, studentId, onNavigate, onBack }) {
  const detail = getNodeDetail(kind, id);

  if (!detail) {
    return (
      <div className="node-detail-page">
        <button type="button" className="node-detail-back-btn" onClick={onBack}>
          ← Back to explorer
        </button>
        <p className="node-detail-empty-text">Couldn't find that node — it may not exist.</p>
      </div>
    );
  }

  const { own, name, grade, children, domain, cluster } = detail;

  let status = 'none';
  if (studentId) {
    if (detail.kind === 'standard') status = getStandardStatus(studentId, id);
    else if (detail.kind === 'subject') status = getSubjectStatus(studentId, id);
    else if (detail.kind === 'skill') status = getSkillStatus(studentId, id);
  }
  const aggregateStatus =
    studentId && detail.kind === 'skill' && (children || []).length > 0
      ? getSkillAggregateStatus(studentId, id)
      : null;

  return (
    <div className="node-detail-page">
      <button type="button" className="node-detail-back-btn" onClick={onBack}>
        ← Back to explorer
      </button>

      <header className="node-detail-header">
        <div className="node-detail-header-top">
          <span className="node-detail-kind-badge">{KIND_LABEL[detail.kind] || detail.kind}</span>
          {grade != null && <span className="node-detail-grade-badge">Grade {grade}</span>}
          <StatusBadge status={status} />
          {aggregateStatus && aggregateStatus !== status && (
            <span className="node-detail-status-aside">(incl. sub-skills: {STATUS_LABEL[aggregateStatus]})</span>
          )}
        </div>
        <h2 className={`node-detail-title${detail.kind === 'standard' ? ' mono-code' : ''}`}>{name}</h2>
      </header>

      <div className="node-detail-main">
        <section className="node-detail-graph-section">
          <h3 className="node-detail-section-title">Knowledge graph — {name}</h3>
          <NodeDetailGraph detail={detail} onNavigate={onNavigate} />
          <p className="graph-hint">
            Click any surrounding node to re-center the graph on it. Amber border = current node.
          </p>
        </section>

        <aside className="node-detail-info-strip">
          <h3 className="node-detail-section-title">Record</h3>

          {own.description && (
            <dl className="node-detail-info-block">
              <dt>Description</dt>
              <dd>{own.description}</dd>
            </dl>
          )}

          {own.jurisdiction && (
            <dl className="node-detail-info-block">
              <dt>Jurisdiction</dt>
              <dd>{own.jurisdiction}</dd>
            </dl>
          )}

          {(typeof own.subjectIds !== 'undefined' ||
            typeof own.skillIds !== 'undefined' ||
            typeof own.subSkillIds !== 'undefined') && (
            <dl className="node-detail-info-block">
              <dt>Structure</dt>
              <dd className="node-detail-stat-count">
                {typeof own.subjectIds !== 'undefined' && `${own.subjectIds.length} subject(s)`}
                {typeof own.skillIds !== 'undefined' && `${own.skillIds.length} skill(s)`}
                {typeof own.subSkillIds !== 'undefined' && `${own.subSkillIds.length} sub-skill(s)`}
              </dd>
            </dl>
          )}

          {domain && (
            <dl className="node-detail-info-block">
              <dt>Domain</dt>
              <dd>{domain}</dd>
            </dl>
          )}

          {cluster && cluster.length > 0 && (
            <dl className="node-detail-info-block">
              <dt>Cluster context</dt>
              <dd>
                <ul className="node-detail-cluster-list">
                  {cluster.map((c) => (
                    <li key={c.code}>
                      <span className="mono-code">{c.code}</span> — {c.description}
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>
          )}

          {own.example && (
            <dl className="node-detail-info-block">
              <dt>Worked example</dt>
              <dd className="node-detail-example">{own.example}</dd>
            </dl>
          )}

          {Array.isArray(own.passCriteria) && (
            <dl className="node-detail-info-block">
              <dt>Pass criteria</dt>
              <dd>
                {own.passCriteria.length === 0 ? (
                  <span className="node-detail-empty-text">None available.</span>
                ) : (
                  <ul className="node-detail-criteria-list">
                    {own.passCriteria.map((criterion, idx) => (
                      <li key={idx}>{criterion}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </dl>
          )}
        </aside>
      </div>
    </div>
  );
}
