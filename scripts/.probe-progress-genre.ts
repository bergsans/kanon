/**
 * Continuation of `.probe-progress-depth.ts`: is the fourth register enough, and what
 * does a genre-restricted branch cost?
 *
 * The depth measurement showed the register is the only lever that moves anything — but
 * Hegel still stalls at rank 73, outside the 48 the cross-encoder reads. Two ways out
 * exist: read deeper (more expensive in latency) or add a branch that searches within
 * the genre the query belongs to. The latter is symmetric with the mention branch — it
 * restricts on genre instead of on name, and therefore never guesses who should
 * answer, which is exactly what `EXPAND_SYSTEM` forbids.
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";

const RRF_K = 60;
const db = getDb();

const HYDE_A = [
  "The progress of society from rudeness to civility is not a straight ascent, but a course in which every acquisition of art and manners is purchased by the loss of some earlier virtue. Nations, having attained to opulence, decline into effeminacy; and the very refinements which distinguish the polished age prepare the corruption that overthrows it.",
  "Among the tribes of the interior we found no memory of any ancestor beyond the third generation, nor any tradition of a golden age. Their implements of stone differ little from those disinterred in the barrows of our own country; and the traveller who compares them perceives that the arts have everywhere advanced by the like stages.",
  "And is it your opinion, sir, that the world grows better? Nay, said he, I have seen too many winters. The son builds where the father burned, and the grandson burns again what was built; and the historian, who calls this progress, does but flatter the age that feeds him.",
];
const HYDE_SPEC =
  "The history of the world is the progress of the consciousness of freedom, and this necessity we must comprehend. Spirit does not wander idly through time but returns upon itself; what appears as the ruin of empires is the labour of the Idea attaining a fuller determination of its own essence. Others deny it: the will objectifies itself in one age as in another, and what we call the advancement of the species is a change of masks upon the same suffering.";
const KW_A = ["progress", "the wheel of fortune", "decline and fall", "civilization",
  "rude nations", "savage", "manners", "corruption", "luxury", "perfectibility"];

function toFtsQuery(keywords: string[]): string {
  const terms = keywords.flatMap((k) => k.split(/\s+/))
    .map((t) => t.replace(/["*()^:-]/g, "").trim()).filter((t) => t.length > 2).slice(0, 24);
  return terms.length ? [...new Set(terms)].map((t) => `"${t}"`).join(" OR ") : "";
}

const vecStmt = db.prepare(
  "select chunk_id as chunkId from vec_chunks where embedding match ? and k = ? order by distance",
);
const ftsStmt = db.prepare(
  `select c.id as chunkId from chunks_fts f join chunks c on c.id = f.rowid
    where chunks_fts match ? and c.is_front_matter = 0 order by bm25(chunks_fts) limit ?`,
);

/** The same technique as mentionBranch, but scoped by genre instead of by name. */
function genreBranch(genres: string[], embedding: Float32Array, k: number) {
  const ids = db.prepare(
    `select c.id from chunks c join works w on w.id = c.work_id
      where w.genre in (${genres.map(() => "?").join(",")}) and c.is_front_matter = 0`,
  ).all(...genres) as { id: number }[];
  const blob = vecBlob(embedding);
  const scored: { chunkId: number; d: number }[] = [];
  for (let i = 0; i < ids.length; i += 5000) {
    const slice = ids.slice(i, i + 5000);
    scored.push(...(db.prepare(
      `select chunk_id as chunkId, vec_distance_cosine(embedding, ?) as d from vec_chunks
        where chunk_id in (${slice.map(() => "?").join(",")}) order by d limit ?`,
    ).all(blob, ...slice.map((r) => r.id), k) as { chunkId: number; d: number }[]));
  }
  return { ids: scored.sort((a, b) => a.d - b.d).slice(0, k).map((r) => r.chunkId), pool: ids.length };
}

function fuse(branches: number[][]) {
  const acc = new Map<number, number>();
  for (const ranked of branches)
    ranked.forEach((id, rank) => acc.set(id, (acc.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
  return [...acc.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

const authorOf = db.prepare(
  "select w.author, w.genre from chunks c join works w on w.id = c.work_id where c.id = ?",
);
const TARGETS = ["Hegel", "Schopenhauer", "Nietzsche", "Kant", "Marx", "Engels"];

async function report(label: string, branches: number[][]) {
  const fused = fuse(branches);
  const meta = fused.map((id) => authorOf.get(id) as { author: string; genre: string });
  console.log(`\n──── ${label}  (${branches.length} grenar, ${fused.length} stycken)`);
  for (const t of TARGETS) {
    const first = meta.findIndex((m) => m.author.includes(t));
    const at48 = meta.slice(0, 48).filter((m) => m.author.includes(t)).length;
    const at100 = meta.slice(0, 100).filter((m) => m.author.includes(t)).length;
    console.log(`  ${t.padEnd(14)} plats ${first === -1 ? "  —" : String(first + 1).padStart(3)}   i topp48: ${at48}   i topp100: ${at100}`);
  }
  const g = new Map<string, number>();
  for (const m of meta.slice(0, 48)) g.set(m.genre, (g.get(m.genre) ?? 0) + 1);
  console.log(`  topp48 per genre: ${[...g].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

const vecA: number[][] = [];
for (const p of HYDE_A) vecA.push((vecStmt.all(vecBlob(await embedQuery(p)), 100) as { chunkId: number }[]).map((r) => r.chunkId));
const kwB = (ftsStmt.all(toFtsQuery(KW_A), 100) as { chunkId: number }[]).map((r) => r.chunkId);
const embSpec = await embedQuery(HYDE_SPEC);
const vecSpec = (vecStmt.all(vecBlob(embSpec), 100) as { chunkId: number }[]).map((r) => r.chunkId);

const t0 = Date.now();
const gb = genreBranch(["filosofi"], await embedQuery(HYDE_A[0]), 100);
const ms = Date.now() - t0;
console.log(`\ngenregren "filosofi": ${gb.pool.toLocaleString("sv-SE")} stycken avsökta på ${ms} ms`);

await report("A — planen som gavs", [...vecA, kwB]);
await report("F — A + genregren (filosofi, traktatstycket)", [...vecA, kwB, gb.ids]);
await report("B — A + fjärde register", [...vecA, vecSpec, kwB]);
await report("G — A + fjärde register + genregren", [...vecA, vecSpec, kwB, gb.ids]);
