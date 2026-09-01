/**
 * The `BRANCH_LIMIT` sweep, after `.probe-progress-weltgeschichte.ts` showed where
 * the fault actually sits.
 *
 * §548 — "Universal History", the passage the query is looking for — misses the vector
 * branches' top 100 by 0.019 in cosine distance. It's never read, never makes it into the
 * fusion, and neither the pool nor reranking can do anything about it. Scored by the
 * cross-encoder it *would* have landed at rank 18 of 103, well within the 28.
 *
 * The question, then, is how deep the branches must fetch for it to make it in, and
 * what that costs among the 96 the cross-encoder reads: every passage that comes in
 * from above pushes out one that was already there. That's the trade-off measured here,
 * not just whether Hegel makes it in.
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";

const RRF_K = 60;
const POOL = 96;
const db = getDb();

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
  `select w.author, w.title, c.locator from chunks c join works w on w.id = c.work_id where c.id = ?`,
);

const WELT = db
  .prepare(
    `select c.id from chunks c join works w on w.id = c.work_id
      where w.author like '%Hegel%' and w.title like '%Philosophy of Mind%'
        and c.locator like '%Mind Objective%'
        and (c.text like '%Universal History%' or c.text like '%history of the world%'
             or c.text like '%world-history%' or c.text like '%World-spirit%')`,
  )
  .all() as { id: number }[];
const weltIds = new Set(WELT.map((r) => r.id));

const embeddings: Float32Array[] = [];
for (const p of HYDE) embeddings.push(await embedQuery(p));
const fts = toFtsQuery(KEYWORDS);

/** The pool at k=100 — the reference every deeper sweep is compared against. */
let baseline: number[] = [];

for (const k of [100, 200, 300, 500]) {
  const branches: number[][] = [];
  const t0 = Date.now();
  for (const emb of embeddings)
    branches.push((vecStmt.all(vecBlob(emb), k) as { chunkId: number }[]).map((r) => r.chunkId));
  branches.push((ftsStmt.all(fts, k) as { chunkId: number }[]).map((r) => r.chunkId));
  const ms = Date.now() - t0;

  const acc = new Map<number, number>();
  for (const ranked of branches)
    ranked.forEach((id, rank) => acc.set(id, (acc.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
  const fused = [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter((id) => (meta.get(id) as { author?: string } | undefined)?.author !== undefined);

  const pool = fused.slice(0, POOL);
  if (k === 100) baseline = pool;

  const welt = [...weltIds]
    .map((id) => ({ id, at: fused.indexOf(id) + 1 }))
    .filter((r) => r.at > 0)
    .sort((a, b) => a.at - b.at);
  const kept = pool.filter((id) => baseline.includes(id)).length;

  console.log(
    `\n──── k=${k}  (${ms} ms, fusion ${fused.length} stycken)\n` +
      `  Weltgeschichte i fusionen: ${welt.length ? welt.map((r) => `#${r.id} plats ${r.at}`).join(", ") : "ingen"}\n` +
      `  inom poolen (${POOL}): ${welt.filter((r) => r.at <= POOL).length}\n` +
      `  kvar av k=100:s pool: ${kept}/${POOL}`,
  );

  // What got pushed out is just as important as what came in.
  if (k !== 100) {
    const lost = baseline.filter((id) => !pool.includes(id));
    const gained = pool.filter((id) => !baseline.includes(id));
    const name = (id: number) => {
      const m = meta.get(id) as { author: string; title: string };
      return `${m.author.split(" ").pop()} (${m.title.slice(0, 28)})`;
    };
    console.log(`  ut: ${lost.slice(0, 6).map(name).join(", ")}${lost.length > 6 ? ` …+${lost.length - 6}` : ""}`);
    console.log(`  in: ${gained.slice(0, 6).map(name).join(", ")}${gained.length > 6 ? ` …+${gained.length - 6}` : ""}`);
  }
}
