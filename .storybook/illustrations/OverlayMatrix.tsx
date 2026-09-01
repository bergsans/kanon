import { scaleBand } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * Which keyboard and scroll guarantees each overlay gives. Shape, not color,
 * separates met from missing — a dot, an empty cell, a diagonal for n/a —
 * so the figure doesn't repeat the color-only failure it sits next to.
 */
type Cell = "yes" | "no" | "n/a";

const OVERLAYS = ["ContextSheet", "CostTag", "NavMenu", "Export/Save"] as const;
const ROWS: { guarantee: string; cells: readonly Cell[] }[] = [
  { guarantee: "Scroll locked", cells: ["yes", "yes", "no", "n/a"] },
  { guarantee: "Focus trap + return", cells: ["yes", "yes", "no", "no"] },
  { guarantee: "Arrow-key roving", cells: ["n/a", "n/a", "yes", "no"] },
];
const LABEL = `Guarantee matrix, ${OVERLAYS.join(", ")} by ${ROWS.map((r) => r.guarantee).join(", ")}: a dot marks a guarantee met, an empty cell marks it missing, a diagonal line marks n/a. Only ContextSheet and CostTag get scroll lock and a focus trap; only NavMenu gets arrow-key roving.`;

const WIDTH = 480;
const HEIGHT = 190;
const MARGIN = { top: 30, right: 8, bottom: 8, left: 140 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

export function OverlayMatrix() {
  const x = scaleBand()
    .domain(OVERLAYS)
    .range([0, INNER_WIDTH])
    .padding(0.18);
  const y = scaleBand()
    .domain(ROWS.map((r) => r.guarantee))
    .range([0, INNER_HEIGHT])
    .padding(0.22);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {OVERLAYS.map((overlay) => (
          <text
            key={overlay}
            x={(x(overlay) ?? 0) + x.bandwidth() / 2}
            y={-10}
            textAnchor="middle"
            fontSize={10}
            fill={ink[600]}
          >
            {overlay}
          </text>
        ))}

        {ROWS.map((row) => {
          const bandY = y(row.guarantee) ?? 0;
          const bandH = y.bandwidth();
          return (
            <g key={row.guarantee}>
              <text x={-10} y={bandY + bandH / 2} dy="0.35em" textAnchor="end" fontSize={11} fill={ink[600]}>
                {row.guarantee}
              </text>
              {OVERLAYS.map((overlay, i) => {
                const cell = row.cells[i];
                const bandX = x(overlay) ?? 0;
                const size = Math.min(x.bandwidth(), bandH);
                const cx = bandX + x.bandwidth() / 2;
                const cy = bandY + bandH / 2;
                return (
                  <g key={overlay}>
                    <rect
                      x={bandX}
                      y={bandY}
                      width={x.bandwidth()}
                      height={bandH}
                      fill={parchment[0]}
                      stroke={parchment[300]}
                      strokeWidth={1}
                    />
                    {cell === "yes" && <circle cx={cx} cy={cy} r={size / 5} fill={accent[600]} />}
                    {cell === "n/a" && (
                      <line
                        x1={bandX + 6}
                        y1={bandY + 6}
                        x2={bandX + x.bandwidth() - 6}
                        y2={bandY + bandH - 6}
                        stroke={parchment[300]}
                        strokeWidth={1}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>
    </GuideFigure>
  );
}
