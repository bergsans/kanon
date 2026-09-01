import { scaleBand } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { accent, ink } from "./theme";

/**
 * The same word unselected and selected in each of the app's three
 * treatments. The third column deliberately gets no extra mark: a change
 * of color alone is the whole problem with it, and the swatch shows that
 * by looking almost unchanged.
 */
const TREATMENTS = [
  { label: "Weight + line", sub: "TextSize, CorpusBrowser tabs" },
  { label: "Border + fill", sub: "Corpus filter chips" },
  { label: "Color alone", sub: "NavMenu dropdowns" },
] as const;
const LABEL =
  "Three selected-state treatments compared, not-selected above and selected below: weight plus an accent underline; an accent border with a tinted fill; and, for NavMenu's dropdowns, a color change alone with no border, fill, or weight difference.";

const WIDTH = 480;
const HEIGHT = 150;
const MARGIN_LEFT = 92;
const ROW_NOT = 46;
const ROW_SEL = 100;

export function SelectedStateSwatches() {
  const x = scaleBand()
    .domain(TREATMENTS.map((t) => t.label))
    .range([MARGIN_LEFT, WIDTH])
    .padding(0.18);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <text x={0} y={ROW_NOT} fontSize={9.5} fill={ink[400]}>
        not selected
      </text>
      <text x={0} y={ROW_SEL} fontSize={9.5} fill={ink[400]}>
        selected
      </text>
      {TREATMENTS.map((t) => {
        const bandX = x(t.label) ?? 0;
        const w = x.bandwidth();
        const cx = bandX + w / 2;
        return (
          <g key={t.label}>
            <text x={cx} y={ROW_NOT} textAnchor="middle" fontSize={13} fill={ink[600]}>
              Era
            </text>
            {t.label === "Weight + line" && (
              <g>
                <text x={cx} y={ROW_SEL} textAnchor="middle" fontSize={13} fontWeight={600} fill={ink[900]}>
                  Era
                </text>
                <rect x={cx - 14} y={ROW_SEL + 6} width={28} height={2} fill={accent[600]} />
              </g>
            )}
            {t.label === "Border + fill" && (
              <g>
                <rect
                  x={cx - 26}
                  y={ROW_SEL - 16}
                  width={52}
                  height={24}
                  fill={accent[600]}
                  fillOpacity={0.1}
                  stroke={accent[600]}
                  strokeWidth={2}
                />
                <text x={cx} y={ROW_SEL} textAnchor="middle" fontSize={13} fill={ink[900]}>
                  Era
                </text>
              </g>
            )}
            {t.label === "Color alone" && (
              <text x={cx} y={ROW_SEL} textAnchor="middle" fontSize={13} fill={accent[700]}>
                Era
              </text>
            )}
            <text x={cx} y={HEIGHT - 20} textAnchor="middle" fontSize={10.5} fill={ink[600]}>
              {t.label}
            </text>
            <text x={cx} y={HEIGHT - 6} textAnchor="middle" fontSize={8.5} fill={ink[400]}>
              {t.sub}
            </text>
          </g>
        );
      })}
    </GuideFigure>
  );
}
