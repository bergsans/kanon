import { scaleBand, scalePoint } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * Heading levels per page: filled dot for a level present, outline for one
 * missing. Only a jump that skips a level is dashed accent, so a skip is a
 * different mark, not just a longer line.
 */
const PAGES: { label: string; levels: number[] }[] = [
  { label: "/ idle", levels: [1, 2] },
  { label: "/ or /s/[id], answer", levels: [2, 4] },
  { label: "/collection", levels: [1, 2, 3] },
  { label: "/costs", levels: [1, 3] },
  { label: "/projects/[slug]", levels: [1, 2, 4] },
  { label: "both not-found", levels: [] },
];
const LEVELS = [1, 2, 3, 4];
const LABEL = `Heading levels present per page, h1 to h4, skips marked: ${PAGES.map((p) => `${p.label} — ${p.levels.length ? p.levels.map((l) => `h${l}`).join(", ") : "no heading at all"}`).join("; ")}.`;

const WIDTH = 480;
const ROW_HEIGHT = 30;
const MARGIN = { top: 20, right: 12, bottom: 4, left: 142 };
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = PAGES.length * ROW_HEIGHT;
const HEIGHT = INNER_HEIGHT + MARGIN.top + MARGIN.bottom;
const DOT_R = 4;

export function HeadingStaircase() {
  const x = scalePoint<number>(LEVELS, [0, INNER_WIDTH]).padding(0.5);
  const y = scaleBand()
    .domain(PAGES.map((p) => p.label))
    .range([0, INNER_HEIGHT])
    .padding(0.3);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {LEVELS.map((level) => (
          <text key={level} x={x(level)} y={-8} textAnchor="middle" fontSize={10} fill={ink[600]}>
            h{level}
          </text>
        ))}

        {PAGES.map((page) => {
          const rowY = (y(page.label) ?? 0) + y.bandwidth() / 2;
          const segments = page.levels.slice(0, -1).map((level, i) => ({
            from: level,
            to: page.levels[i + 1],
            skipped: page.levels[i + 1] - level > 1,
          }));
          return (
            <g key={page.label}>
              <text x={-10} y={rowY} dy="0.35em" textAnchor="end" fontSize={10} fill={ink[600]}>
                {page.label}
              </text>
              {segments.map((seg) => (
                <line
                  key={`${seg.from}-${seg.to}`}
                  x1={x(seg.from)}
                  x2={x(seg.to)}
                  y1={rowY}
                  y2={rowY}
                  stroke={seg.skipped ? accent[600] : ink[600]}
                  strokeWidth={seg.skipped ? 2 : 1}
                  strokeDasharray={seg.skipped ? "3,3" : undefined}
                />
              ))}
              {LEVELS.map((level) => {
                const present = page.levels.includes(level);
                return present ? (
                  <circle key={level} cx={x(level)} cy={rowY} r={DOT_R} fill={ink[800]} />
                ) : (
                  <circle
                    key={level}
                    cx={x(level)}
                    cy={rowY}
                    r={DOT_R}
                    fill={parchment[0]}
                    stroke={parchment[300]}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          );
        })}
      </g>
    </GuideFigure>
  );
}
