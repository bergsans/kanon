import { GuideFigure } from "./GuideFigure";
import { fontSerif, ink, parchment } from "./theme";

/**
 * The sizes in use, smallest to largest, each set at its real size in the
 * face it's used in. The three bracketed rem values sit between Tailwind's
 * steps on purpose, so they're drawn among them rather than in a separate
 * table where they read as exceptions.
 */
const SIZES = [
  { cls: "text-[0.6875rem]", px: 11, serif: false, where: "rank digits, counters, tag pills" },
  { cls: "text-xs", px: 12, serif: false, where: "chrome: labels, metadata, links" },
  { cls: "text-sm", px: 14, serif: false, where: "body copy, teasers, rationale" },
  { cls: "text-[0.9375rem]", px: 15, serif: true, where: "neighbor rows, corpus authors" },
  { cls: "text-[1.0625rem]", px: 17, serif: true, where: "quote, context prose, row titles" },
  { cls: "text-lg – 2xl", px: 20, serif: true, where: "the question field, serif section headings" },
  { cls: "text-3xl – 5xl", px: 36, serif: true, where: "page h1, one step larger from sm" },
] as const;
const LABEL = `Type sizes in use, smallest to largest: ${SIZES.map((s) => `${s.cls} for ${s.where}`).join("; ")}.`;

const WIDTH = 480;
const CLASS_X = 0;
const SPECIMEN_X = 124;
const WHERE_X = 190;
const ROW_GAP = 12;

export function TypeScaleLadder() {
  let y = 0;
  const rows = SIZES.map((s) => {
    y += Math.max(s.px, 14) + ROW_GAP;
    return { ...s, baseline: y };
  });
  const height = y + 10;

  return (
    <GuideFigure width={WIDTH} height={height} label={LABEL}>
      {rows.map((s) => (
        <g key={s.cls}>
          <text x={CLASS_X} y={s.baseline} fontSize={10.5} fill={ink[600]}>
            {s.cls}
          </text>
          <text x={SPECIMEN_X} y={s.baseline} fontSize={s.px} fontFamily={s.serif ? fontSerif : undefined} fill={ink[900]}>
            Ag
          </text>
          <text x={WHERE_X} y={s.baseline} fontSize={10.5} fill={ink[600]}>
            {s.where}
          </text>
          <line x1={0} x2={WIDTH} y1={s.baseline + 5} y2={s.baseline + 5} stroke={parchment[200]} strokeWidth={0.5} />
        </g>
      ))}
    </GuideFigure>
  );
}
