/**
 * Small legend row explaining a graph's node colors and edge line styles.
 * Each item is either a "node" swatch (filled circle/rectangle) or a
 * "line" swatch (a short solid/dashed/dotted segment), so the same
 * component covers both color-coding and line-style meaning.
 *
 * @param {object} props
 * @param {Array<{
 *   kind: "node" | "line" | "border",
 *   color: string,
 *   label: string,
 *   shape?: "circle" | "rect",
 *   lineStyle?: "solid" | "dashed" | "dotted",
 * }>} props.items
 *   - "node": a filled circle/rectangle swatch (node color meaning)
 *   - "line": a short line segment swatch (edge line-style meaning)
 *   - "border": a hollow ring swatch, solid or dashed (status border meaning)
 */
export default function GraphLegend({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <ul className="graph-legend">
      {items.map((item, index) => (
        <li key={`${index}-${item.label}`} className="graph-legend-item">
          {item.kind === 'line' && (
            <span
              className={`graph-legend-swatch graph-legend-swatch-line graph-legend-line-${item.lineStyle || 'solid'}`}
              style={{ borderColor: item.color }}
            />
          )}
          {item.kind === 'border' && (
            <span
              className={`graph-legend-swatch graph-legend-swatch-border graph-legend-border-${item.lineStyle || 'solid'}`}
              style={{ borderColor: item.color }}
            />
          )}
          {item.kind === 'node' && (
            <span
              className={`graph-legend-swatch${item.shape === 'rect' ? ' graph-legend-swatch-rect' : ''}`}
              style={{ backgroundColor: item.color }}
            />
          )}
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
