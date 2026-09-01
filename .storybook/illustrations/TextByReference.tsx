import { GuideFigure } from "./GuideFigure";
import { accent, ink, parchment } from "./theme";

/**
 * One rule explains three tables at once: `searches`, `project_passages` and
 * `translations` each keep a passage's `chunk_id` (and a `text_hash` guard
 * against a re-index reusing that id) instead of a copy of the text — see
 * their doc comments in `db.ts`, all making the same argument independently.
 * Worth a figure because the shape, not any one comment, is the point: draw
 * it once and the "why a hash, not just an id" question in each of those
 * three comments answers itself.
 */
const LABEL =
  "chunks is the only place passage text lives. works owns its chunks, one to many, deleted on cascade. searches, project_passages and translations each point at a chunk by id and a text_hash instead of copying the text, so a re-index — which reuses chunk ids — can't leave a stale quotation behind; a hash that no longer matches counts as a miss and is recomputed.";

const WIDTH = 660;
const HEIGHT = 236;

const worksX = 24, worksY = 92, worksW = 100, worksH = 52;
const chunksX = 190, chunksY = 84, chunksW = 140, chunksH = 68;
const spokeX = 420, spokeW = 216;
const spokes = [
  { y: 14, title: "searches", sub: "passages: chunk id + hash, inline" },
  { y: 93, title: "project_passages", sub: "chunk_id, no foreign key" },
  { y: 172, title: "translations", sub: "chunk_id primary key" },
];
const spokeH = 44;
const worksCy = worksY + worksH / 2;
const chunksCy = chunksY + chunksH / 2;
const chunksRight = chunksX + chunksW;

export function TextByReference() {
  return (
    <GuideFigure width={WIDTH} height={HEIGHT} label={LABEL}>
      <defs>
        <marker id="ref-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ink[600]} />
        </marker>
        <marker id="ref-arrow-dashed" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ink[400]} />
        </marker>
      </defs>

      <rect x={worksX} y={worksY} width={worksW} height={worksH} fill={parchment[0]} stroke={parchment[300]} />
      <text x={worksX + worksW / 2} y={worksY + 22} textAnchor="middle" fontSize={11} fontWeight={600} fill={ink[900]}>
        works
      </text>
      <text x={worksX + worksW / 2} y={worksY + 38} textAnchor="middle" fontSize={9} fill={ink[600]}>
        1 row / text
      </text>

      <line x1={worksX + worksW + 6} y1={worksCy} x2={chunksX - 6} y2={chunksCy} stroke={ink[600]} strokeWidth={1.5} markerEnd="url(#ref-arrow)" />
      <text x={worksX + worksW + (chunksX - worksX - worksW) / 2} y={worksCy - 8} textAnchor="middle" fontSize={9} fill={ink[600]}>
        owns · 1:N
      </text>

      <rect x={chunksX} y={chunksY} width={chunksW} height={chunksH} fill={accent[600]} fillOpacity={0.08} stroke={accent[600]} strokeWidth={1.5} />
      <text x={chunksX + chunksW / 2} y={chunksY + 24} textAnchor="middle" fontSize={12} fontWeight={600} fill={ink[900]}>
        chunks
      </text>
      <text x={chunksX + chunksW / 2} y={chunksY + 40} textAnchor="middle" fontSize={9} fill={ink[600]}>
        the text lives here,
      </text>
      <text x={chunksX + chunksW / 2} y={chunksY + 53} textAnchor="middle" fontSize={9} fontStyle="italic" fill={ink[600]}>
        + chunks_fts, vec_chunks
      </text>

      {spokes.map((s) => {
        const cy = s.y + spokeH / 2;
        return (
          <g key={s.title}>
            <line
              x1={spokeX - 6}
              y1={cy}
              x2={chunksRight + 6}
              y2={chunksCy}
              stroke={ink[400]}
              strokeWidth={1.25}
              strokeDasharray="4,3"
              markerEnd="url(#ref-arrow-dashed)"
            />
            <rect x={spokeX} y={s.y} width={spokeW} height={spokeH} fill={parchment[0]} stroke={parchment[300]} />
            <text x={spokeX + 10} y={s.y + 18} fontSize={10.5} fontWeight={600} fill={ink[900]}>
              {s.title}
            </text>
            <text x={spokeX + 10} y={s.y + 33} fontSize={8.5} fill={ink[600]}>
              {s.sub}
            </text>
          </g>
        );
      })}

      <text x={WIDTH / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={9.5} fill={ink[800]}>
        id + text_hash, never a copy — a re-index reuses chunk ids, and the hash is what catches it
      </text>
    </GuideFigure>
  );
}
