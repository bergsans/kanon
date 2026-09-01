import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * `CanonSearch`'s phases and the `SearchEvent` (`src/lib/protocol.ts`) that
 * moves each one on, with what the reader sees meanwhile. Worth a figure
 * because the order isn't obvious from either file alone: `passages`
 * arrives before `done`, a cached answer skips `candidates`, and the
 * skeleton spans all three busy phases rather than one. Status strings
 * are the English locale's.
 */
const PHASES = [
  { id: "idle", event: "", status: [] as string[] },
  { id: "expanding", event: "submit", status: ["Reading the", "question…"] },
  { id: "retrieving", event: "plan", status: ["Searching the", "corpus…"] },
  { id: "reading", event: "candidates", status: ["Reading N passages", "from M works…"] },
  { id: "done", event: "passages, done", status: ["list, cost tag,", "/s/[slug] in the URL"] },
] as const;

const LABEL =
  "Search phases: idle, then expanding on submit, retrieving on plan, reading on candidates, done on passages and done. A cached answer goes from plan straight to passages and done. Skeleton rows cover the three busy phases; any of them can end in an error, and done with zero passages shows the empty message.";

const WIDTH = 480;
const HEIGHT = 236;
const NODE_W = 80;
const NODE_H = 26;
const NODE_Y = 70;
const STEP = 98;
const FIRST_X = 44;

const cx = (i: number) => FIRST_X + i * STEP;

export function SearchStateFlow() {
  const bracketY = 142;
  const branchY = 184;

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ink[600]} />
        </marker>
      </defs>

      <path
        d={`M ${cx(2)} ${NODE_Y - 4} Q ${cx(3)} ${NODE_Y - 70} ${cx(4)} ${NODE_Y - 4}`}
        fill="none"
        stroke={ink[400]}
        strokeDasharray="4,3"
        markerEnd="url(#flow-arrow)"
      />
      <text x={cx(3)} y={16} textAnchor="middle" fontSize={9.5} fill={ink[600]}>
        cached: passages, done — no candidates
      </text>

      {PHASES.map((phase, i) => (
        <g key={phase.id}>
          {i > 0 && (
            <>
              <line
                x1={cx(i - 1) + NODE_W / 2}
                x2={cx(i) - NODE_W / 2 - 1}
                y1={NODE_Y + NODE_H / 2}
                y2={NODE_Y + NODE_H / 2}
                stroke={ink[600]}
                markerEnd="url(#flow-arrow)"
              />
              <text x={cx(i) - STEP / 2} y={NODE_Y - 8} textAnchor="middle" fontSize={9} fontWeight={600} fill={ink[800]}>
                {phase.event}
              </text>
            </>
          )}
          <rect x={cx(i) - NODE_W / 2} y={NODE_Y} width={NODE_W} height={NODE_H} fill={parchment[0]} stroke={parchment[300]} />
          <text x={cx(i)} y={NODE_Y + NODE_H / 2} dy="0.35em" textAnchor="middle" fontSize={10.5} fill={ink[900]}>
            {phase.id}
          </text>
          {phase.status.map((line, j) => (
            <text key={line} x={cx(i)} y={NODE_Y + NODE_H + 14 + j * 11} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
              {line}
            </text>
          ))}
        </g>
      ))}

      <path
        d={`M ${cx(1) - NODE_W / 2} ${bracketY - 6} V ${bracketY} H ${cx(3) + NODE_W / 2} V ${bracketY - 6}`}
        fill="none"
        stroke={ink[400]}
      />
      <circle cx={cx(2) - 62} cy={bracketY + 13} r={2.5} fill={accent[600]} />
      <text x={cx(2) - 54} y={bracketY + 13} dy="0.35em" fontSize={9} fill={ink[800]}>
        three skeleton rows, pulsing dot
      </text>

      <line x1={cx(2)} x2={cx(2)} y1={bracketY + 22} y2={branchY - 1} stroke={ink[600]} markerEnd="url(#flow-arrow)" />
      <rect x={cx(2) - NODE_W / 2} y={branchY} width={NODE_W} height={NODE_H} fill={parchment[0]} stroke={parchment[300]} />
      <text x={cx(2)} y={branchY + NODE_H / 2} dy="0.35em" textAnchor="middle" fontSize={10.5} fill={ink[900]}>
        error
      </text>
      <text x={cx(2)} y={branchY + NODE_H + 14} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
        "Something went wrong"
      </text>

      <line x1={cx(4)} x2={cx(4)} y1={NODE_Y + NODE_H + 30} y2={branchY - 1} stroke={ink[600]} markerEnd="url(#flow-arrow)" />
      <text x={cx(4) - 6} y={branchY - 12} textAnchor="end" fontSize={9} fontWeight={600} fill={ink[800]}>
        0 passages
      </text>
      <rect x={cx(4) - NODE_W / 2} y={branchY} width={NODE_W} height={NODE_H} fill={parchment[0]} stroke={parchment[300]} />
      <text x={cx(4)} y={branchY + NODE_H / 2} dy="0.35em" textAnchor="middle" fontSize={10.5} fill={ink[900]}>
        empty
      </text>
      <text x={cx(4) - 4} y={branchY + NODE_H + 14} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
        "No passage … matched"
      </text>
    </GuideFigure>
  );
}
