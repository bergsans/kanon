import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * The other pipeline — how a work becomes searchable, deliberately drawn
 * with the same five-box rhythm as `PipelineFlow` so the two read as a
 * matched pair: one turns a question into an answer, this one turns a
 * manifest entry into something that pipeline can find. `scripts/ingest.ts`,
 * one work at a time.
 */
const STAGES = [
  { id: "0 manifest", lines: ["~2,690 works,", "10 generators"] },
  { id: "1 fetch + rights", lines: ["source's own file,", "header verified"] },
  { id: "2 chunk", lines: ["paragraphs + headings,", "per language"] },
  { id: "3 embed", lines: ["batched 32,", "same model as questions"] },
  { id: "4 index", lines: ["chunks + vec_chunks,", "chunk_count written last"] },
] as const;

const LABEL =
  "Ingest pipeline: stage 0 reads the manifest, about 2,690 works from ten generators. Stage 1 fetches the work's text from its own source and verifies it against that source's own file header, not a catalog. Stage 2 splits it into paragraphs and headings, rules that differ per language. Stage 3 embeds the body text in batches of 32, with the same multilingual model a question is embedded with, which is what lets a Swedish question reach English prose. Stage 4 writes the chunk rows and their vectors, and chunk_count last, marking the work as fully indexed. A work already indexed — chunk_count greater than zero — is skipped rather than re-fetched.";

const WIDTH = 700;
const HEIGHT = 150;
const NODE_W = 96;
const NODE_H = 28;
const NODE_Y = 40;
const STEP = 108;
const FIRST_X = 54;
const END_X = FIRST_X + STAGES.length * STEP;

const cx = (i: number) => FIRST_X + i * STEP;

export function IngestFlow() {
  const branchY = NODE_Y + NODE_H + 46;

  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <defs>
        <marker id="ingest-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
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
              markerEnd="url(#ingest-arrow)"
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
        x2={END_X - NODE_W / 2 - 1}
        y1={NODE_Y + NODE_H / 2}
        y2={NODE_Y + NODE_H / 2}
        stroke={ink[600]}
        markerEnd="url(#ingest-arrow)"
      />
      <rect x={END_X - NODE_W / 2} y={NODE_Y} width={NODE_W} height={NODE_H} fill={parchment[50]} stroke={parchment[300]} strokeDasharray="4,3" />
      <text x={END_X} y={NODE_Y + NODE_H / 2} dy="0.35em" textAnchor="middle" fontSize={10} fontWeight={600} fill={ink[900]}>
        searchable
      </text>
      <text x={END_X} y={NODE_Y + NODE_H + 14} textAnchor="middle" fontSize={8.5} fill={ink[600]}>
        ready for the other pipeline's stage 2
      </text>

      <path
        d={`M ${cx(0)} ${NODE_Y + NODE_H + 4} V ${branchY} H ${END_X} V ${NODE_Y + NODE_H + 4}`}
        fill="none"
        stroke={ink[400]}
        strokeDasharray="4,3"
        markerEnd="url(#ingest-arrow)"
      />
      <circle cx={(cx(0) + END_X) / 2 - 95} cy={branchY} r={2.5} fill={accent[600]} />
      <text x={(cx(0) + END_X) / 2 - 87} y={branchY} dy="0.35em" fontSize={9} fill={ink[800]}>
        chunk_count &gt; 0: already indexed, skipped rather than re-fetched
      </text>
    </GuideFigure>
  );
}
