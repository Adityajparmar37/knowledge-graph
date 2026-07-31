/**
 * Small "worked example + pass criteria" detail card shown beneath the
 * Subject/Skill graph once a leaf skill or sub-skill node is clicked.
 * Mirrors the rounded info box from the mockup, rendered as real HTML so
 * the pass-criteria list stays legible (rather than cramming it into a
 * Cytoscape node's label).
 */
export default function InfoCard({ node }) {
  if (!node) {
    return (
      <div className="info-card info-card-empty">
        Click a skill or sub-skill node to see its worked example and pass criteria.
      </div>
    );
  }

  const { name, example, passCriteria = [] } = node;

  return (
    <div className="info-card">
      <div className="info-card-header">
        <span className="info-card-badge">Example</span>
        <h4 className="info-card-title">{name}</h4>
      </div>

      {example && <p className="info-card-example">{example}</p>}

      <div className="info-card-criteria">
        <span className="info-card-subheading">Pass criteria</span>
        {passCriteria.length === 0 ? (
          <p className="info-card-empty-text">No pass criteria available.</p>
        ) : (
          <ul>
            {passCriteria.map((criterion, idx) => (
              <li key={idx}>{criterion}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
