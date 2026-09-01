import { scaleBand } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * The three hover treatments icon-only buttons use for one kind of
 * control: the square is the hover fill (dashed when there is none), the
 * dot the color the glyph turns. Side by side is the only way the drift
 * shows — each looks reasonable alone.
 */
const TREATMENTS = [
  { label: "Glyph only", sub: "menu, info, filter clear", hover: accent[700], fill: null },
  { label: "Neutral fill", sub: "dialog close", hover: ink[800], fill: { color: parchment[100], opacity: 1 } },
  { label: "Accent tint", sub: "remove a recent search", hover: accent[700], fill: { color: accent[600], opacity: 0.1 } },
] as const;
const LABEL =
  "Three hover treatments for icon-only buttons: glyph turns accent-700 with no fill (menu, info, filter clear); neutral parchment-100 fill with ink-800 glyph (dialog close); accent tint fill with accent-700 glyph (remove a recent search).";

const WIDTH = 480;
const HEIGHT = 124;
const SWATCH = 48;

export function IconButtonSwatches() {
  const x = scaleBand()
    .domain(TREATMENTS.map((t) => t.label))
    .range([0, WIDTH])
    .padding(0.3);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      {TREATMENTS.map((t) => {
        const bandX = x(t.label) ?? 0;
        const cx = bandX + x.bandwidth() / 2;
        return (
          <g key={t.label}>
            {t.fill ? (
              <rect x={bandX} width={x.bandwidth()} height={SWATCH} fill={t.fill.color} fillOpacity={t.fill.opacity} />
            ) : (
              <rect
                x={bandX}
                width={x.bandwidth()}
                height={SWATCH}
                fill="none"
                stroke={parchment[200]}
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            )}
            <circle cx={cx} cy={SWATCH / 2} r={7} fill={t.hover} />
            <text x={cx} y={SWATCH + 18} textAnchor="middle" fontSize={10.5} fill={ink[900]}>
              {t.label}
            </text>
            <text x={cx} y={SWATCH + 32} textAnchor="middle" fontSize={9} fill={ink[600]}>
              {t.sub}
            </text>
          </g>
        );
      })}
    </GuideFigure>
  );
}
