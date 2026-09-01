import { scaleBand } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { accent, ink } from "./theme";

/**
 * Three string pairs from the dictionary, Swedish above English below, that
 * the prose alone doesn't stick: an ellipsis while something is still
 * happening, a single word once it's done, and one idiom for "no charge" —
 * with the word it could have been instead struck through beneath it, since
 * that's the actual failure mode: a second, uncoordinated term drifting in
 * alongside the first one.
 */
const PAIRS = [
  { label: "In progress", sv: "Söker…", en: "Searching…", wrongSv: "", wrongEn: "" },
  { label: "Done", sv: "Sparat", en: "Saved", wrongSv: "", wrongEn: "" },
  { label: "No charge", sv: "kostar ingenting", en: "costs nothing", wrongSv: "gratis", wrongEn: "free" },
] as const;

const LABEL =
  "Three string pairs from the dictionary, Swedish above English below: an in-progress pair carrying an ellipsis, a done pair as a single word with no ellipsis, and the no-charge idiom with the word it replaced, gratis and free, struck through beneath it and marked not this.";

const WIDTH = 480;
const HEIGHT = 168;
const ROW_LABEL = 22;
const ROW_SV = 60;
const ROW_EN = 82;
const ROW_WRONG = 122;

export function VoiceStatePairs() {
  const x = scaleBand()
    .domain(PAIRS.map((p) => p.label))
    .range([0, WIDTH])
    .padding(0.12);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      {PAIRS.map((p) => {
        const bandX = x(p.label) ?? 0;
        const cx = bandX + x.bandwidth() / 2;
        return (
          <g key={p.label}>
            <text x={cx} y={ROW_LABEL} textAnchor="middle" fontSize={9.5} fill={ink[400]}>
              {p.label}
            </text>
            <text x={cx} y={ROW_SV} textAnchor="middle" fontSize={15} fontWeight={600} fill={ink[900]}>
              {p.sv}
            </text>
            <text x={cx} y={ROW_EN} textAnchor="middle" fontSize={12} fill={ink[600]}>
              {p.en}
            </text>
            {p.wrongSv && (
              <>
                <line x1={cx - 36} x2={cx + 36} y1={ROW_WRONG - 4} y2={ROW_WRONG - 4} stroke={ink[400]} strokeWidth={0.75} />
                <text x={cx} y={ROW_WRONG} textAnchor="middle" fontSize={10.5} fill={ink[400]} textDecoration="line-through">
                  {p.wrongSv}
                </text>
                <text x={cx} y={ROW_WRONG + 16} textAnchor="middle" fontSize={10.5} fill={ink[400]} textDecoration="line-through">
                  {p.wrongEn}
                </text>
                <text x={cx} y={ROW_WRONG + 34} textAnchor="middle" fontSize={8.5} fill={accent[700]}>
                  not this
                </text>
              </>
            )}
          </g>
        );
      })}
    </GuideFigure>
  );
}
