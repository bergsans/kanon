import { scaleBand, scaleLinear } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * The measured pairs from the `@theme` comment in `globals.css`, so the
 * question "may this text sit on this surface?" is answered by looking,
 * not by finding the comment. Each row carries a sample in its real
 * colors; the two accent lines are WCAG 2.1's thresholds — 4.5 for text,
 * 3.0 for a control's outline (1.4.11). Change a token: re-measure there
 * and copy the figure here.
 */
const SURFACE = { ground: parchment[50], sheet: parchment[0], panel: parchment[100] } as const;

type Pair = { fg: string; fgName: string; bg: keyof typeof SURFACE; ratio: number; text: boolean };

const PAIRS: Pair[] = [
  { fg: ink[900], fgName: "ink-900", bg: "sheet", ratio: 16.75, text: true },
  { fg: ink[800], fgName: "ink-800", bg: "sheet", ratio: 15.11, text: true },
  { fg: ink[800], fgName: "ink-800", bg: "ground", ratio: 13.19, text: true },
  { fg: ink[400], fgName: "ink-400", bg: "sheet", ratio: 7.75, text: true },
  { fg: ink[400], fgName: "ink-400", bg: "ground", ratio: 6.77, text: true },
  { fg: accent[600], fgName: "accent-600", bg: "sheet", ratio: 5.96, text: true },
  { fg: ink[400], fgName: "ink-400", bg: "panel", ratio: 5.75, text: true },
  { fg: accent[600], fgName: "accent-600", bg: "ground", ratio: 5.2, text: true },
  { fg: parchment[300], fgName: "parchment-300", bg: "sheet", ratio: 3.69, text: false },
  { fg: parchment[200], fgName: "parchment-200", bg: "sheet", ratio: 1.99, text: false },
];

const LABEL =
  "Contrast of each measured color pair against WCAG thresholds 4.5 (text) and 3.0 (outlines): every text pair clears 4.5, parchment-300 clears 3.0 as an outline, and parchment-200 at 1.99 is a hairline that never carries text.";

const WIDTH = 480;
const ROW = 24;
const MARGIN = { top: 22, right: 40, bottom: 6, left: 180 };
const SAMPLE = 30;
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = PAIRS.length * ROW;
const HEIGHT = INNER_HEIGHT + MARGIN.top + MARGIN.bottom;

export function ContrastPairs() {
  const x = scaleLinear().domain([0, 17]).range([0, INNER_WIDTH]);
  const y = scaleBand<number>()
    .domain(PAIRS.map((_, i) => i))
    .range([0, INNER_HEIGHT])
    .padding(0.25);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {[3, 4.5].map((threshold) => (
          <g key={threshold}>
            <line x1={x(threshold)} x2={x(threshold)} y1={-6} y2={INNER_HEIGHT} stroke={accent[600]} strokeWidth={1} />
            <text x={x(threshold)} y={-10} textAnchor="middle" fontSize={10} fill={accent[700]}>
              {threshold}
            </text>
          </g>
        ))}

        {PAIRS.map((pair, i) => {
          const bandY = y(i) ?? 0;
          const h = y.bandwidth();
          return (
            <g key={`${pair.fgName}-${pair.bg}`} transform={`translate(0,${bandY})`}>
              <text x={-SAMPLE - 12} y={h / 2} dy="0.35em" textAnchor="end" fontSize={10.5} fill={ink[600]}>
                {pair.fgName} on {pair.bg}
              </text>
              <rect x={-SAMPLE - 4} width={SAMPLE} height={h} fill={SURFACE[pair.bg]} stroke={parchment[200]} strokeWidth={0.5} />
              {pair.text ? (
                <text x={-SAMPLE / 2 - 4} y={h / 2} dy="0.35em" textAnchor="middle" fontSize={11} fontWeight={600} fill={pair.fg}>
                  Aa
                </text>
              ) : (
                <line x1={-SAMPLE} x2={-8} y1={h / 2} y2={h / 2} stroke={pair.fg} strokeWidth={2} />
              )}
              <rect width={x(pair.ratio)} height={h} fill={pair.text ? ink[600] : parchment[300]} />
              <text x={x(pair.ratio) + 6} y={h / 2} dy="0.35em" fontSize={10.5} fill={ink[800]}>
                {pair.ratio.toFixed(2)}
              </text>
            </g>
          );
        })}
      </g>
    </GuideFigure>
  );
}
