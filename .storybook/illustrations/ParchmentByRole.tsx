import { scaleBand } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { ink, parchment } from "./theme";

/**
 * Fill tokens drawn as fills, border tokens as outlines — the same tone
 * does different jobs depending on which, and `parchment-200` does both.
 */
const ROLES = [
  { token: "bg-parchment-0", role: "Sheet", kind: "fill", color: parchment[0] },
  { token: "bg-parchment-50", role: "Ground, chip", kind: "fill", color: parchment[50] },
  { token: "bg-parchment-100", role: "Hover / callout", kind: "fill", color: parchment[100] },
  { token: "bg-parchment-200", role: "Progress track", kind: "fill", color: parchment[200] },
  { token: "border-parchment-300", role: "Clickable outline", kind: "border", color: parchment[300] },
  { token: "border-parchment-200", role: "Hairline", kind: "border", color: parchment[200] },
] as const;
const LABEL = `Six parchment tokens by role: ${ROLES.map((r) => `${r.token} — ${r.role}`).join(", ")}.`;

const WIDTH = 480;
const HEIGHT = 130;
const SWATCH = 56;

export function ParchmentByRole() {
  const x = scaleBand()
    .domain(ROLES.map((r) => r.token))
    .range([0, WIDTH])
    .padding(0.18);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      {ROLES.map((r) => {
        const bandX = x(r.token) ?? 0;
        const cx = bandX + x.bandwidth() / 2;
        return (
          <g key={r.token}>
            {r.kind === "fill" ? (
              <rect x={bandX} width={x.bandwidth()} height={SWATCH} fill={r.color} />
            ) : (
              <rect
                x={bandX + 2}
                y={2}
                width={x.bandwidth() - 4}
                height={SWATCH - 4}
                fill={parchment[0]}
                stroke={r.color}
                strokeWidth={2.5}
              />
            )}
            <text x={cx} y={SWATCH + 18} textAnchor="middle" fontSize={9.5} fill={ink[800]}>
              {r.role}
            </text>
          </g>
        );
      })}
    </GuideFigure>
  );
}
