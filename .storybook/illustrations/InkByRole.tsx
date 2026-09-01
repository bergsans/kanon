import { scaleBand } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { ink, parchment } from "./theme";

/**
 * Glyphs in the real tone rather than filled swatches: ink is only ever
 * text, and four near-black rectangles hide the steps that "Aa" shows.
 */
const ROLES = [
  { token: "ink-900", role: "Heading, quote", color: ink[900] },
  { token: "ink-800", role: "Default text", color: ink[800] },
  { token: "ink-600", role: "Secondary", color: ink[600] },
  { token: "ink-400", role: "Muted", color: ink[400] },
] as const;
const LABEL = `Four ink tones by role, darkest to lightest: ${ROLES.map((r) => `${r.token} — ${r.role}`).join(", ")}.`;

const WIDTH = 480;
const HEIGHT = 130;
const SWATCH = 64;

export function InkByRole() {
  const x = scaleBand()
    .domain(ROLES.map((r) => r.token))
    .range([0, WIDTH])
    .padding(0.25);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      {ROLES.map((r) => {
        const bandX = x(r.token) ?? 0;
        const cx = bandX + x.bandwidth() / 2;
        return (
          <g key={r.token}>
            <rect x={bandX} width={x.bandwidth()} height={SWATCH} fill={parchment[0]} stroke={parchment[200]} strokeWidth={1} />
            <text x={cx} y={SWATCH / 2} dy="0.35em" textAnchor="middle" fontSize={26} fontWeight={600} fill={r.color}>
              Aa
            </text>
            <text x={cx} y={SWATCH + 20} textAnchor="middle" fontSize={11} fill={ink[800]}>
              {r.role}
            </text>
            <text x={cx} y={SWATCH + 34} textAnchor="middle" fontSize={9} fill={ink[400]}>
              {r.token}
            </text>
          </g>
        );
      })}
    </GuideFigure>
  );
}
