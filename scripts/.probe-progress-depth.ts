/**
 * Where in the fusion list the German thinkers actually end up — and which intervention
 * moves them into the reranking pool.
 *
 * The query "does progress happen in history" returned zero Hegel, Schopenhauer, Nietzsche,
 * Kant, and Marx, despite all five being indexed. The cross-encoder only reads the top 48
 * from the fusion, so anything below 48 is already gone by the time it runs.
 * If the German passages sit at rank 200, no reranking helps — then it's
 * retrieval that must change, and this measures which end of it.
 *
 * The branches are replicated here instead of calling `hybridSearch`, which only
 * returns the top after the diversification filter. Same SQL, same RRF_K, same k.
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";

const RRF_K = 60;
const RERANK_POOL = 48;
const db = getDb();

/** Verbatim the plan expandQuery gave for the query. */
const HYDE_A = [
  "The progress of society from rudeness to civility is not a straight ascent, but a course in which every acquisition of art and manners is purchased by the loss of some earlier virtue. Nations, having attained to opulence, decline into effeminacy; and the very refinements which distinguish the polished age prepare the corruption that overthrows it.",
  "Among the tribes of the interior we found no memory of any ancestor beyond the third generation, nor any tradition of a golden age. Their implements of stone differ little from those disinterred in the barrows of our own country; and the traveller who compares them perceives that the arts have everywhere advanced by the like stages.",
  "And is it your opinion, sir, that the world grows better? Nay, said he, I have seen too many winters. The son builds where the father burned, and the grandson burns again what was built; and the historian, who calls this progress, does but flatter the age that feeds him.",
];
const KW_A = ["progress", "the wheel of fortune", "decline and fall", "civilization",
  "rude nations", "savage", "manners", "corruption", "luxury", "perfectibility"];

/**
 * A fourth register: the speculative system-building voice. Neither treatise, narrative,
 * nor dialogue — it's the voice that speaks of history as a whole, and the one the
 * query is actually looking for.
 */
const HYDE_SPEC =
  "The history of the world is the progress of the consciousness of freedom, and this necessity we must comprehend. Spirit does not wander idly through time but returns upon itself; what appears as the ruin of empires is the labour of the Idea attaining a fuller determination of its own essence. Others deny it: the will objectifies itself in one age as in another, and what we call the advancement of the species is a change of masks upon the same suffering.";

/** The same keywords minus the prompt's own example words, which came back verbatim. */
const KW_CLEAN = KW_A.filter(
  (k) => !["rude nations", "savage", "manners", "luxury", "the wheel of fortune"].includes(k),
);

function toFtsQuery(keywords: string[]): string {
  const terms = keywords
    .flatMap((k) => k.split(/\s+/))
    .map((t) => t.replace(/["*()^:-]/g, "").trim())
    .filter((t) => t.length > 2)
    .slice(0, 24);
  if (terms.length === 0) return "";
  return [...new Set(terms)].map((t) => `"${t}"`).join(" OR ");
}

const vecStmt = db.prepare(
  "select chunk_id as chunkId from vec_chunks where embedding match ? and k = ? order by distance",
);
const ftsStmt = db.prepare(
  `select c.id as chunkId from chunks_fts f join chunks c on c.id = f.rowid
    where chunks_fts match ? and c.is_front_matter = 0 order by bm25(chunks_fts) limit ?`,
);

function fuse(branches: number[][]) {
  const acc = new Map<number, number>();
  for (const ranked of branches)
    ranked.forEach((id, rank) => acc.set(id, (acc.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
  return [...acc.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

const authorOf = db.prepare(
  "select w.author from chunks c join works w on w.id = c.work_id where c.id = ?",
);
const TARGETS = ["Hegel", "Schopenhauer", "Nietzsche", "Kant", "Marx", "Engels"];

async function variant(label: string, hyde: string[], keywords: string[], k: number) {
  const branches: number[][] = [];
  for (const p of hyde) {
    const emb = await embedQuery(p);
    branches.push((vecStmt.all(vecBlob(emb), k) as { chunkId: number }[]).map((r) => r.chunkId));
  }
  const fts = toFtsQuery(keywords);
  if (fts) branches.push((ftsStmt.all(fts, k) as { chunkId: number }[]).map((r) => r.chunkId));

  const fused = fuse(branches);
  const authors = fused.map((id) => (authorOf.get(id) as { author: string }).author);

  console.log(`\n──── ${label}  (k=${k}, ${branches.length} grenar, ${fused.length} stycken)`);
  for (const t of TARGETS) {
    const first = authors.findIndex((a) => a.includes(t));
    const inPool = authors.slice(0, RERANK_POOL).filter((a) => a.includes(t)).length;
    const total = authors.filter((a) => a.includes(t)).length;
    console.log(
      `  ${t.padEnd(14)} första plats ${first === -1 ? "  —" : String(first + 1).padStart(3)}` +
        `   i poolen(48): ${inPool}   totalt: ${total}`,
    );
  }
}

await variant("A — planen som gavs", HYDE_A, KW_A, 100);
await variant("B — + fjärde register (spekulativt)", [...HYDE_A, HYDE_SPEC], KW_A, 100);
await variant("C — nyckelord utan promptens exempelord", HYDE_A, KW_CLEAN, 100);
await variant("D — djupare grenar, samma plan", HYDE_A, KW_A, 300);
await variant("E — fjärde register + rensade nyckelord", [...HYDE_A, HYDE_SPEC], KW_CLEAN, 100);
