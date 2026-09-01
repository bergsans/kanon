import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * Where the provider cookie (`provider.ts`) actually reaches into the
 * pipeline: stage 1 and stage 4 run a different model outright, and the
 * candidate count handed from stage 3 to stage 4 is the one place the choice
 * changes a *number* rather than which model answers — `CANDIDATES` (64) in
 * `claude.ts`, `LOCAL_CANDIDATES` (28) in `local.ts`, the only pool size
 * `.probe-rerank-local.ts` ever measured for a local reranker.
 */
const LABEL =
  "Provider split: one cookie decides which model runs stage 1, expansion, and stage 4, selection — claude.ts or local.ts, the same prompts and schemas either way. Claude's track hands 64 candidates from stage 3 to stage 4; the local track hands 28, the only pool size ever measured for a local reranker. Both tracks converge on the same NDJSON stream.";

const WIDTH = 660;
const HEIGHT = 190;

const startX = 20, startY = 76, startW = 108, startH = 40;
const col1X = 172, col2X = 350, colW1 = 108, colW2 = 150;
const endX = 566, endW = 74;
const topY = 18, botY = 132, rowH = 40;
const startCy = startY + startH / 2;
const topCy = topY + rowH / 2;
const botCy = botY + rowH / 2;

export function ProviderSplit() {
  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <defs>
        <marker id="split-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ink[600]} />
        </marker>
      </defs>

      <rect x={startX} y={startY} width={startW} height={startH} fill={parchment[0]} stroke={parchment[300]} />
      <text x={startX + startW / 2} y={startY + 17} textAnchor="middle" fontSize={10} fontWeight={600} fill={ink[900]}>
        provider.ts
      </text>
      <text x={startX + startW / 2} y={startY + 31} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
        one cookie
      </text>

      {(
        [
          { cy: topCy, model: "claude.ts", n: "64", y: topY },
          { cy: botCy, model: "local.ts", n: "28", y: botY },
        ] as const
      ).map((row) => (
        <g key={row.model}>
          <line x1={startX + startW + 4} y1={startCy} x2={col1X - 4} y2={row.cy} stroke={ink[600]} markerEnd="url(#split-arrow)" />
          <rect x={col1X} y={row.y} width={colW1} height={rowH} fill={parchment[0]} stroke={parchment[300]} />
          <text x={col1X + colW1 / 2} y={row.y + 17} textAnchor="middle" fontSize={10} fontWeight={600} fill={ink[900]}>
            1 expand
          </text>
          <text x={col1X + colW1 / 2} y={row.y + 31} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
            {row.model}
          </text>

          <line x1={col1X + colW1 + 4} y1={row.cy} x2={col2X - 4} y2={row.cy} stroke={ink[600]} markerEnd="url(#split-arrow)" />
          <rect x={col2X} y={row.y} width={colW2} height={rowH} fill={parchment[0]} stroke={parchment[300]} />
          <text x={col2X + colW2 / 2} y={row.y + 17} textAnchor="middle" fontSize={10} fontWeight={600} fill={ink[900]}>
            4 select
          </text>
          <text x={col2X + colW2 / 2} y={row.y + 31} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
            of <tspan fill={accent[700]} fontWeight={700}>{row.n}</tspan> candidates
          </text>

          <line x1={col2X + colW2 + 4} y1={row.cy} x2={endX - 4} y2={startCy} stroke={ink[600]} markerEnd="url(#split-arrow)" />
        </g>
      ))}

      <rect x={endX} y={startY} width={endW} height={startH} fill={parchment[50]} stroke={parchment[300]} strokeDasharray="4,3" />
      <text x={endX + endW / 2} y={startY + 17} textAnchor="middle" fontSize={10} fontWeight={600} fill={ink[900]}>
        stream
      </text>
      <text x={endX + endW / 2} y={startY + 31} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
        same shape
      </text>
    </GuideFigure>
  );
}
