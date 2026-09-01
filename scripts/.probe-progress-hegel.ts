/**
 * Aftermath of `.probe-progress-live.ts`: Hegel, Nietzsche, and Kant were still
 * missing from the 28, despite the fourth register and pool 96. Two completely
 * different failures look identical in that list.
 *
 *   a) the passages sit below fusion rank 96 — the cross-encoder never reads them,
 *      and raising the pool bought them nothing.
 *   b) the passages sit inside the 96, get read, and score low — then it's the
 *      cross-encoder that failed them, not retrieval.
 *
 * The distinction decides whether the doubled latency is worth anything. Free: the plan
 * below is verbatim what Claude gave in the paid run, so no call is needed.
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";
import { scorePairs } from "../src/lib/rerank";

const RRF_K = 60;
const POOL = 96;
const db = getDb();

const QUERY_EN = "Does progress occur in history, or not?";

/** Verbatim the plan from the paid run. */
const HYDE = [
  "It is the part of the philosopher to inquire whether the successive ages of mankind exhibit a true advance, or whether the appearance of improvement be but a shifting of the same passions into new forms. If reason be the same in every age, and the ends of human action be fixed by nature, then what men call progress can be nothing more than the better ordering of unchanging materials; but if reason itself grow, then history is not a wheel but a ladder, and each generation stands upon the shoulders of the last.",
  "In the annals of the Roman people we may observe how the same causes, luxury, the decay of manners, and the corruption of the nobility, brought low a state that had once subdued the world; and the rude nations that overthrew it were, in their own turn, softened by conquest and raised from barbarism to a new order. Thus among the Goths, the Franks, and the Huns we see not a single ascent but an alternation of vigour and decline, so that the historian must ask whether the arts and laws of one century truly exceed those of another, or only differ.",
  "FIRST CITIZEN: Methinks the world goes forward, for we have bread where our fathers starved. SECOND CITIZEN: Aye, but the tyrant sits where the tyrant sat before, only his coat is finer. FIRST CITIZEN: Is that not something? SECOND CITIZEN: It is a change of coats, friend, not a change of hearts; and when the famine comes again, thou shalt see the old cruelty walk abroad in the new fashion, and call itself improvement.",
  "It is the necessity of the Idea that it pass through its own negation and return to itself enriched, so that what seems the ruin of one age is but the labour-pain of the next; the World-Spirit does not repeat itself vainly, but climbs, by the very contradictions that appear as decline, toward its own perfect self-consciousness. Even so the relations of production, having ripened within the old form until that form can contain them no longer, burst it asunder, and a new order arises of necessity, not by the will of man; and this ascent, though it wear the mask of catastrophe, is the sole and inexorable law of the whole historical process.",
];
const KEYWORDS = [
  "progress", "the march of civilization", "decline and fall", "manners", "rude nations",
  "barbarism", "the Idea", "World-Spirit", "dialectic", "necessity", "relations of production",
  "corruption", "luxury", "the wheel of fortune", "ages of mankind", "improvement",
  "advance of reason",
];

function toFtsQuery(keywords: string[]): string {
  const terms = keywords
    .flatMap((k) => k.split(/\s+/))
    .map((t) => t.replace(/["*()^:-]/g, "").trim())
    .filter((t) => t.length > 2)
    .slice(0, 24);
  return [...new Set(terms)].map((t) => `"${t}"`).join(" OR ");
}

const vecStmt = db.prepare(
  "select chunk_id as chunkId from vec_chunks where embedding match ? and k = ? order by distance",
);
const ftsStmt = db.prepare(
  `select c.id as chunkId from chunks_fts f join chunks c on c.id = f.rowid
    where chunks_fts match ? and c.is_front_matter = 0 order by bm25(chunks_fts) limit ?`,
);
const meta = db.prepare(
  `select w.author, w.title, c.text from chunks c join works w on w.id = c.work_id where c.id = ?`,
);

const branches: number[][] = [];
for (const p of HYDE) {
  branches.push(
    (vecStmt.all(vecBlob(await embedQuery(p)), 100) as { chunkId: number }[]).map((r) => r.chunkId),
  );
}
branches.push((ftsStmt.all(toFtsQuery(KEYWORDS), 100) as { chunkId: number }[]).map((r) => r.chunkId));

const acc = new Map<number, number>();
for (const ranked of branches)
  ranked.forEach((id, rank) => acc.set(id, (acc.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
const fused = [...acc.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

const TARGETS = ["Hegel", "Nietzsche", "Kant", "Schopenhauer", "Marx", "Engels"];
// vec_chunks can carry orphaned rows after a reindex — hybridSearch
// filters them out the same way, so the list here should look the same as the app's.
const rows = fused
  .map((id) => meta.get(id) as { author: string; title: string; text: string } | undefined)
  .filter((r): r is { author: string; title: string; text: string } => r !== undefined);

console.log(`\nfusionslistan: ${fused.length} stycken, cross-encodern läser ${POOL}\n`);
for (const t of TARGETS) {
  const hits = rows.map((r, i) => (r.author.includes(t) ? i + 1 : 0)).filter(Boolean);
  const inPool = hits.filter((p) => p <= POOL);
  console.log(
    `  ${t.padEnd(14)} platser ${hits.length ? hits.slice(0, 8).join(", ") : "—"}` +
      `${hits.length > 8 ? " …" : ""}   inom ${POOL}: ${inPool.length}   (vid 48: ${hits.filter((p) => p <= 48).length})`,
  );
}

// What the cross-encoder actually did with the ones that were inside the pool.
const pool = rows.slice(0, POOL);
const scores = await scorePairs(pool.map((r) => ({ query: QUERY_EN, passage: r.text })));
const ranked = pool
  .map((r, i) => ({ ...r, score: scores[i], fusionRank: i + 1 }))
  .sort((a, b) => b.score - a.score);

console.log(`\nefter cross-encodern (plats i fusionen inom parentes):\n`);
ranked.forEach((r, i) => {
  const hit = TARGETS.some((t) => r.author.includes(t));
  if (i < 30 || hit)
    console.log(
      ` ${hit ? "«" : " "}${String(i + 1).padStart(3)}. ${r.score.toFixed(3)} (${String(r.fusionRank).padStart(2)}) ` +
        `${r.author} — ${r.title.slice(0, 46)}`,
    );
});
