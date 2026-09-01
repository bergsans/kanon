import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * The server-side chain a question travels through, `README.md`'s "How
 * search works" 0–4 redrawn as boxes instead of a numbered list. Worth a
 * figure because the numbers move with the collection — see `BRANCH_LIMIT`,
 * `RERANK_POOL`, and `WORK_SHARE`/`AUTHOR_SHARE` in `search.ts`, and
 * `CANDIDATES` in `claude.ts` — and a stale copy here would be exactly the
 * kind of drift `AGENTS.md` warns against. Update the numbers alongside
 * those constants, not on a schedule.
 */
const STAGES = [
  { id: "0 cache", lines: ["verbatim, then", "vector ≥0.95"] },
  { id: "1 expand", lines: ["9 HyDE + keywords", "~$0.021"] },
  { id: "2 retrieval", lines: ["9 vector + BM25 + mention", "→ RRF, filtered per branch"] },
  { id: "3 cross-encoder", lines: ["cross-encoder, 192 →", "diversify 3/28, 4/28"] },
  { id: "4 Claude selects", lines: ["of 64 candidates,", "each justified, ~$0.12"] },
] as const;

const LABEL =
  "Server pipeline: stage 0, the cache, answers verbatim or above 0.95 vector similarity with no call to Claude and skips straight to the stream. Otherwise stage 1 expands the question into nine HyDE passages, keywords and mentions for about $0.021. Stage 2, hybrid retrieval, runs nine vector branches, BM25 and a mention branch, fused by Reciprocal Rank Fusion, with the genre and era filter applied inside every branch rather than to the fused list afterward. Stage 3, the cross-encoder, runs locally and scores 192 candidates, then a diversity filter admits at most 3 passages per work and 4 per author out of every 28. Stage 4 sends the 64 survivors to Claude, who selects and justifies the ones that answer, for about $0.12. The result streams to the client as NDJSON.";

const WIDTH = 700;
const HEIGHT = 150;
const NODE_W = 96;
const NODE_H = 28;
const NODE_Y = 40;
const STEP = 108;
const FIRST_X = 54;
const STREAM_X = FIRST_X + STAGES.length * STEP;

const cx = (i: number) => FIRST_X + i * STEP;

export function PipelineFlow() {
  const branchY = NODE_Y + NODE_H + 46;

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <defs>
        <marker id="pipeline-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ink[600]} />
        </marker>
      </defs>

      {STAGES.map((stage, i) => (
        <g key={stage.id}>
          {i > 0 && (
            <line
              x1={cx(i - 1) + NODE_W / 2}
              x2={cx(i) - NODE_W / 2 - 1}
              y1={NODE_Y + NODE_H / 2}
              y2={NODE_Y + NODE_H / 2}
              stroke={ink[600]}
              markerEnd="url(#pipeline-arrow)"
            />
          )}
          <rect x={cx(i) - NODE_W / 2} y={NODE_Y} width={NODE_W} height={NODE_H} fill={parchment[0]} stroke={parchment[300]} />
          <text x={cx(i)} y={NODE_Y + NODE_H / 2} dy="0.35em" textAnchor="middle" fontSize={10} fontWeight={600} fill={ink[900]}>
            {stage.id}
          </text>
          {stage.lines.map((line, j) => (
            <text key={line} x={cx(i)} y={NODE_Y + NODE_H + 14 + j * 11} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
              {line}
            </text>
          ))}
        </g>
      ))}

      <line
        x1={cx(STAGES.length - 1) + NODE_W / 2}
        x2={STREAM_X - NODE_W / 2 - 1}
        y1={NODE_Y + NODE_H / 2}
        y2={NODE_Y + NODE_H / 2}
        stroke={ink[600]}
        markerEnd="url(#pipeline-arrow)"
      />
      <rect x={STREAM_X - NODE_W / 2} y={NODE_Y} width={NODE_W} height={NODE_H} fill={parchment[50]} stroke={parchment[300]} strokeDasharray="4,3" />
      <text x={STREAM_X} y={NODE_Y + NODE_H / 2} dy="0.35em" textAnchor="middle" fontSize={10} fontWeight={600} fill={ink[900]}>
        stream
      </text>
      <text x={STREAM_X} y={NODE_Y + NODE_H + 14} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
        NDJSON to the client
      </text>

      <path
        d={`M ${cx(0)} ${NODE_Y + NODE_H + 4} V ${branchY} H ${STREAM_X} V ${NODE_Y + NODE_H + 4}`}
        fill="none"
        stroke={ink[400]}
        strokeDasharray="4,3"
        markerEnd="url(#pipeline-arrow)"
      />
      <circle cx={(cx(0) + STREAM_X) / 2 - 92} cy={branchY} r={2.5} fill={accent[600]} />
      <text x={(cx(0) + STREAM_X) / 2 - 84} y={branchY} dy="0.35em" fontSize={9} fill={ink[800]}>
        cache hit: no Claude call, straight to the stream
      </text>
    </GuideFigure>
  );
}
