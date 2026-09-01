import { scaleBand } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * The geometry each focus recipe produces, since four sets of utilities are
 * hard to picture side by side. The dot flags the corpus filter's ring —
 * the style `SearchBox`'s own comment argues against.
 */
const TREATMENTS = [
  { label: "Search textarea", kind: "width" },
  { label: "Project field", kind: "color" },
  { label: "Corpus filter", kind: "ring", flagged: true },
  { label: "NavMenu trigger", kind: "outline" },
] as const;
const LABEL =
  "Four focus treatments compared: a 2px border on all sides; a 1px border that only changes color; a translucent ring around an unchanged border, flagged as the style the search textarea's own comment argues against; and a 2px outline drawn outside the box, offset from it.";

const WIDTH = 480;
const HEIGHT = 150;
const MARGIN_LEFT = 74;
const BOX = 56;
const ROW_UNFOCUSED = 30;
const ROW_FOCUSED = 96;

export function FocusTreatmentSwatches() {
  const x = scaleBand()
    .domain(TREATMENTS.map((t) => t.label))
    .range([MARGIN_LEFT, WIDTH])
    .padding(0.2);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <text x={0} y={ROW_UNFOCUSED + 16} fontSize={9.5} fill={ink[400]}>
        unfocused
      </text>
      <text x={0} y={ROW_FOCUSED + 16} fontSize={9.5} fill={ink[400]}>
        focused
      </text>
      {TREATMENTS.map((t) => {
        const bandX = x(t.label) ?? 0;
        const w = x.bandwidth();
        const boxX = bandX + w / 2 - BOX / 2;
        return (
          <g key={t.label}>
            <rect x={boxX} y={ROW_UNFOCUSED} width={BOX} height={28} fill="none" stroke={parchment[300]} strokeWidth={1} />

            {t.kind === "outline" && (
              <rect
                x={boxX - 4}
                y={ROW_FOCUSED - 4}
                width={BOX + 8}
                height={36}
                fill="none"
                stroke={accent[600]}
                strokeWidth={2}
                strokeDasharray="3,2"
              />
            )}
            {t.kind === "ring" && (
              <rect
                x={boxX - 4}
                y={ROW_FOCUSED - 4}
                width={BOX + 8}
                height={36}
                fill="none"
                stroke={accent[600]}
                strokeOpacity={0.3}
                strokeWidth={4}
              />
            )}
            <rect
              x={boxX}
              y={ROW_FOCUSED}
              width={BOX}
              height={28}
              fill="none"
              stroke={accent[600]}
              strokeWidth={t.kind === "width" ? 2 : 1}
            />
            {"flagged" in t && t.flagged && <circle cx={boxX + BOX + 10} cy={ROW_FOCUSED - 8} r={3} fill={accent[700]} />}

            <text x={bandX + w / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
              {t.label}
            </text>
          </g>
        );
      })}
    </GuideFigure>
  );
}
