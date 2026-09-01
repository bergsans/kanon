import { scaleBand } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * Every fraction of `accent-600` in `src/app`, at its real opacity and with
 * its one role, so a new tint is picked from the set instead of invented.
 * `/30` is marked: it's the corpus filter's focus ring, the style
 * `SearchBox`'s own comment argues against.
 */
const STEPS = [
  { step: 8, role: "notice" },
  { step: 10, role: "hover" },
  { step: 12, role: "chip" },
  { step: 15, role: "highlight" },
  { step: 20, role: "match" },
  { step: 30, role: "ring *" },
  { step: 40, role: "border" },
  { step: 50, role: "bar" },
  { step: 70, role: "map pin" },
] as const;
const LABEL = `Accent-600 opacity steps in use, with roles: ${STEPS.map((s) => `/${s.step} ${s.role}`).join(", ")}.`;

const WIDTH = 480;
const HEIGHT = 92;
const SWATCH = 44;

export function OpacityRamp() {
  const x = scaleBand<number>()
    .domain(STEPS.map((s) => s.step))
    .range([0, WIDTH])
    .padding(0.2);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      {STEPS.map(({ step, role }) => (
        <g key={step} transform={`translate(${x(step) ?? 0},0)`}>
          <rect width={x.bandwidth()} height={SWATCH} fill={accent[600]} fillOpacity={step / 100} stroke={parchment[300]} strokeWidth={0.75} />
          <text x={x.bandwidth() / 2} y={SWATCH + 16} textAnchor="middle" fontSize={11} fontWeight={600} fill={ink[900]}>
            /{step}
          </text>
          <text x={x.bandwidth() / 2} y={SWATCH + 30} textAnchor="middle" fontSize={9} fill={ink[600]}>
            {role}
          </text>
        </g>
      ))}
    </GuideFigure>
  );
}
