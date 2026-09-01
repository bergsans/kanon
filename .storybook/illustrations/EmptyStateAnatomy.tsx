import { GuideFigure } from "./GuideFigure";
import { accent, fontMono, ink } from "./theme";

/**
 * `result.empty` and `result.emptyFiltered` side by side, split at the same
 * seam: a clause naming what's missing, then a clause suggesting what to do
 * about it. The filtered version's second clause gains a clause of its own
 * ("or widen the selection", underlined) — that extra words is the entire
 * reason it's a second dictionary key instead of one string reused with a
 * different subject list spliced in.
 */
const LABEL =
  "The two empty-result strings split at the same seam: a clause naming what's missing, then a clause suggesting a next step, shown in Swedish and English. The filtered version's suggestion clause carries one extra, underlined phrase — or widen the selection — that the unfiltered version doesn't need.";

const WIDTH = 480;
const HEIGHT = 190;
const LEFT = 4;

export function EmptyStateAnatomy() {
  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <text x={LEFT} y={16} fontFamily={fontMono} fontSize={9.5} fill={ink[400]}>
        result.empty
      </text>
      <text x={LEFT} y={38} fontSize={12.5} fill={ink[900]}>
        Inga stycken i samlingen matchade frågan.
      </text>
      <text x={LEFT} y={56} fontSize={12.5} fill={accent[700]}>
        Pröva att omformulera den.
      </text>
      <text x={LEFT} y={74} fontSize={8.5} fill={ink[400]}>
        No passage in the corpus matched the question. Try putting it differently.
      </text>

      <line x1={LEFT} x2={WIDTH - LEFT} y1={92} y2={92} stroke={ink[400]} strokeWidth={0.5} strokeDasharray="1,3" />

      <text x={LEFT} y={112} fontFamily={fontMono} fontSize={9.5} fill={ink[400]}>
        result.emptyFiltered
      </text>
      <text x={LEFT} y={134} fontSize={12.5} fill={ink[900]}>
        Inga stycken inom {"{list}"} matchade frågan.
      </text>
      <text x={LEFT} y={152} fontSize={12.5} fill={accent[700]}>
        Pröva att omformulera den, eller{" "}
        <tspan textDecoration="underline">att vidga urvalet</tspan>.
      </text>
      <text x={LEFT} y={170} fontSize={8.5} fill={ink[400]}>
        No passage in {"{list}"} matched the question. Try putting it differently,
        <tspan x={LEFT} dy={11}>
          or <tspan textDecoration="underline">widening the selection</tspan>.
        </tspan>
      </text>
    </GuideFigure>
  );
}
