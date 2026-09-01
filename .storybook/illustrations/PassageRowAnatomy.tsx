import { GuideFigure } from "./GuideFigure";
import { accent, fontMono, fontSerif, ink, parchment } from "./theme";

/**
 * The result row with its parts numbered, so a change request can say
 * "the metadata line" or "the ditto mark" and mean the same element. Drawn,
 * not a live `<Story>`: a story shows one state at a time, and the point
 * here is collapsed, same-work, and open side by side. Chrome strings are
 * the English locale's, the rationale stays Swedish as it does in the app;
 * text comes from `storyFixtures.ts`, sizes and tones from `PassageAccordion`.
 */
const PARTS = [
  { y: 10, text: "Register rule — border-t-2 accent-600" },
  { y: 33, text: "Author, title — serif, title in ink-600" },
  { y: 52, text: "Metadata — era · genre · locator · translator" },
  { y: 70, text: "Teaser — the rationale, only while collapsed" },
  { y: 111, text: "Ditto — same work as above; sr-only restores it" },
  { y: 171, text: "Rank, toggle — aria-hidden; state is aria-expanded" },
  { y: 228, text: "Rationale — always Swedish, parchment-300 rule" },
  { y: 284, text: "Quote — serif, lang set to the source language" },
  { y: 324, text: "Actions — dotted-underline links, source ↗ last" },
] as const;

const LABEL =
  "Anatomy of a result row: a collapsed row, a same-work row with the ditto mark, and an open row, with nine numbered parts from the register rule down to the action links.";

const WIDTH = 480;
const HEIGHT = 424;
const LEFT = 20;
const RIGHT = 440;
const TEXT_X = 58;
const MARKER_X = 462;

function Row({ y, rank, open }: { y: number; rank: string; open: boolean }) {
  return (
    <>
      <text x={LEFT + 4} y={y} fontFamily={fontMono} fontSize={10} fill={ink[400]}>
        {rank}
      </text>
      <text x={LEFT + 22} y={y} fontFamily={fontMono} fontSize={13} fill={accent[600]}>
        {open ? "−" : "+"}
      </text>
    </>
  );
}

function Link({ x, children }: { x: number; children: string }) {
  return (
    <text x={x} y={328} fontSize={10.5} fill={ink[400]} textDecoration="underline">
      {children}
    </text>
  );
}

export function PassageRowAnatomy() {
  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <line x1={LEFT} x2={RIGHT} y1={10} y2={10} stroke={accent[600]} strokeWidth={2} />

      <Row y={36} rank="01" open={false} />
      <text x={TEXT_X} y={37} fontFamily={fontSerif} fontSize={16} fill={ink[900]}>
        Epictetus<tspan fill={ink[600]}>, Encheiridion</tspan>
      </text>
      <text x={TEXT_X} y={56} fontSize={10.5} fill={ink[400]}>
        135 CE · philosophy · ch. 1 · trans. Elizabeth Carter
      </text>
      <text x={TEXT_X} y={74} fontSize={11.5} fill={ink[600]}>
        Öppnar Epiktetos hela system: skillnaden mellan det som…
      </text>
      <line x1={LEFT} x2={RIGHT} y1={90} y2={90} stroke={parchment[200]} />

      <Row y={114} rank="02" open={false} />
      <text x={TEXT_X} y={115} fontFamily={fontSerif} fontSize={16} fill={ink[900]}>
        ———
      </text>
      <text x={TEXT_X} y={134} fontSize={10.5} fill={ink[400]}>
        135 CE · philosophy · ch. 8 · trans. Elizabeth Carter
      </text>
      <line x1={LEFT} x2={RIGHT} y1={150} y2={150} stroke={parchment[200]} />

      <Row y={174} rank="03" open />
      <text x={TEXT_X} y={175} fontFamily={fontSerif} fontSize={16} fill={ink[900]}>
        Marcus Aurelius<tspan fill={ink[600]}>, Self-Communings</tspan>
      </text>
      <text x={TEXT_X} y={194} fontSize={10.5} fill={ink[400]}>
        180 CE · philosophy · book II, 1 · trans. George Long
      </text>
      <line x1={TEXT_X} x2={TEXT_X} y1={210} y2={246} stroke={parchment[300]} strokeWidth={2} />
      <text x={TEXT_X + 10} y={223} fontSize={11.5} fill={ink[600]}>
        Samma distinktion praktiskt tillämpad: Marcus Aurelius
      </text>
      <text x={TEXT_X + 10} y={240} fontSize={11.5} fill={ink[600]}>
        vänder den mot andra människors fel snarare än…
      </text>
      <text x={TEXT_X} y={276} fontFamily={fontSerif} fontSize={15} fill={ink[900]}>
        Begin the morning by saying to thyself, I shall
      </text>
      <text x={TEXT_X} y={298} fontFamily={fontSerif} fontSize={15} fill={ink[900]}>
        meet with the busy-body, the ungrateful…
      </text>
      <Link x={TEXT_X}>Show in context</Link>
      <Link x={TEXT_X + 94}>Copy quotation</Link>
      <Link x={TEXT_X + 184}>More …</Link>
      <Link x={TEXT_X + 236}>Project Gutenberg ↗</Link>

      {PARTS.map((part, i) => (
        <g key={part.text}>
          <line x1={RIGHT + 4} x2={MARKER_X - 8} y1={part.y} y2={part.y} stroke={ink[400]} strokeDasharray="2,2" />
          <circle cx={MARKER_X} cy={part.y} r={7} fill={ink[800]} />
          <text x={MARKER_X} y={part.y} dy="0.35em" textAnchor="middle" fontSize={9} fontWeight={600} fill={parchment[0]}>
            {i + 1}
          </text>
        </g>
      ))}

      {PARTS.map((part, i) => (
        <text key={part.text} x={LEFT + (i % 2) * 225} y={356 + Math.floor(i / 2) * 14} fontSize={8.5} fill={ink[600]}>
          <tspan fontWeight={600} fill={ink[900]}>
            {i + 1}
          </tspan>{" "}
          {part.text}
        </text>
      ))}
    </GuideFigure>
  );
}
