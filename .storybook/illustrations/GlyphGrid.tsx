import { scaleBand } from "d3-scale";
import { GuideFigure } from "./GuideFigure";
import { ink, parchment } from "./theme";

/**
 * The interface's glyphs at real size with their meaning, since a `———` or
 * a half-width `·` is easy to misjudge as a character in a table cell. The
 * dot says whether a screen reader hears it — filled: hidden, outline:
 * read aloud. The read-aloud ones are the glyphs whose meaning isn't
 * already said in words next to them.
 */
type Hidden = "yes" | "no" | "mixed";
const GLYPHS: { glyph: string; meaning: [string, string?]; hidden: Hidden }[] = [
  { glyph: "·", meaning: ["same-kind", "separator"], hidden: "yes" },
  { glyph: "+ −", meaning: ["accordion", "closed / open"], hidden: "yes" },
  { glyph: "———", meaning: ["same work", "as above"], hidden: "yes" },
  { glyph: "›", meaning: ["runnable", "example"], hidden: "yes" },
  { glyph: "←", meaning: ["breadcrumb", "back"], hidden: "yes" },
  { glyph: "↗", meaning: ["links out", "to the source"], hidden: "no" },
  { glyph: "✓", meaning: ["already in", "a project"], hidden: "yes" },
  { glyph: "×", meaning: ["clear the", "filter"], hidden: "no" },
  { glyph: "≈", meaning: ["an estimate,", "not a price"], hidden: "no" },
  { glyph: "…", meaning: ["truncated or", "in progress"], hidden: "mixed" },
];
const LABEL = `Ten interface glyphs with their meaning; read aloud: ↗ (links out), × (clear filter), ≈ (estimate); … is mixed; the rest are hidden from assistive tech.`;

const WIDTH = 480;
const COLS = 5;
const ROW_H = 92;
const HEIGHT = ROW_H * 2 + 24;

export function GlyphGrid() {
  const x = scaleBand()
    .domain(Array.from({ length: COLS }, (_, i) => String(i)))
    .range([0, WIDTH])
    .padding(0.08);

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      {GLYPHS.map((g, i) => {
        const cx = (x(String(i % COLS)) ?? 0) + x.bandwidth() / 2;
        const top = Math.floor(i / COLS) * ROW_H;
        return (
          <g key={g.glyph}>
            <text x={cx} y={top + 28} textAnchor="middle" fontSize={22} fill={ink[900]}>
              {g.glyph}
            </text>
            {g.meaning.map((line, j) => (
              <text key={j} x={cx} y={top + 52 + j * 12} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
                {line}
              </text>
            ))}
            {g.hidden === "yes" && <circle cx={cx} cy={top + 80} r={3.5} fill={ink[400]} />}
            {g.hidden === "no" && <circle cx={cx} cy={top + 80} r={3.5} fill="none" stroke={ink[400]} strokeWidth={1.2} />}
            {g.hidden === "mixed" && <path d={`M ${cx} ${top + 76.5} a 3.5 3.5 0 0 1 0 7 z`} fill={ink[400]} stroke={ink[400]} strokeWidth={1.2} />}
          </g>
        );
      })}
      <line x1={0} x2={WIDTH} y1={ROW_H - 2} y2={ROW_H - 2} stroke={parchment[200]} />
      <circle cx={8} cy={HEIGHT - 10} r={3.5} fill={ink[400]} />
      <text x={16} y={HEIGHT - 10} dy="0.35em" fontSize={9.5} fill={ink[600]}>
        hidden from screen readers
      </text>
      <circle cx={160} cy={HEIGHT - 10} r={3.5} fill="none" stroke={ink[400]} strokeWidth={1.2} />
      <text x={168} y={HEIGHT - 10} dy="0.35em" fontSize={9.5} fill={ink[600]}>
        read aloud
      </text>
    </GuideFigure>
  );
}
