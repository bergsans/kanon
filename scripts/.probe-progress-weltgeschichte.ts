/**
 * Correction to `.probe-progress-hegel.ts`: the conclusion "the work isn't in the
 * collection" was wrong. The Encyclopedia's third part ends in Weltgeschichte — §§548–552
 * in *Philosophy of Mind* — and that text is indexed. The passage about history as
 * the progress of the consciousness of freedom is therefore retrievable.
 *
 * The question, then, is a different one: where do exactly those passages go? Three
 * outcomes are possible and each requires a different fix.
 *
 *   a) the passages never make it into any branch's top 100 — retrieval doesn't reach them
 *   b) they make it in but the cross-encoder ranks them low — reranking fails them
 *   c) they make it in and rank high — then they fell to the diversification filter or to Claude
 *
 * Free: the same plan the paid run gave, no call needed.
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";
import { scorePairs } from "../src/lib/rerank";

const RRF_K = 60;
const BRANCH_LIMIT = 100;
const POOL = 96;
const db = getDb();

const QUERY_EN = "Does progress occur in history, or not?";

const HYDE = [
  "It is the part of the philosopher to inquire whether the successive ages of mankind exhibit a true advance, or whether the appearance of improvement be but a shifting of the same passions into new forms. If reason be the same in every age, and the ends of human action be fixed by nature, then what men call progress can be nothing more than the better ordering of unchanging materials; but if reason itself grow, then history is not a wheel but a ladder, and each generation stands upon the shoulders of the last.",
  "In the annals of the Roman people we may observe how the same causes, luxury, the decay of manners, and the corruption of the nobility, brought low a state that had once subdued the world; and the rude nations that overthrew it were, in their own turn, softened by conquest and raised from barbarism to a new order. Thus among the Goths, the Franks, and the Huns we see not a single ascent but an alternation of vigour and decline, so that the historian must ask whether the arts and laws of one century truly exceed those of another, or only differ.",
  "FIRST CITIZEN: Methinks the world goes forward, for we have bread where our fathers starved. SECOND CITIZEN: Aye, but the tyrant sits where the tyrant sat before, only his coat is finer. FIRST CITIZEN: Is that not something? SECOND CITIZEN: It is a change of coats, friend, not a change of hearts; and when the famine comes again, thou shalt see the old cruelty walk abroad in the new fashion, and call itself improvement.",
  "It is the necessity of the Idea that it pass through its own negation and return to itself enriched, so that what seems the ruin of one age is but the labour-pain of the next; the World-Spirit does not repeat itself vainly, but climbs, by the very contradictions that appear as decline, toward its own perfect self-consciousness. Even so the relations of production, having ripened within the old form until that form can contain them no longer, burst it asunder, and a new order arises of necessity, not by the will of man; and this ascent, though it wear the mask of catastrophe, is the sole and inexorable law of the whole historical process.",
];
const KEYWORDS = [
  "progress",
  "the march of civilization",
  "decline and fall",
  "manners",
  "rude nations",
  "barbarism",
  "the Idea",
  "World-Spirit",
  "dialectic",
  "necessity",
  "relations of production",
  "corruption",
  "luxury",
  "the wheel of fortune",
  "ages of mankind",
  "improvement",
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

/**
 * The Weltgeschichte section, fetched by its own content rather than by a
 * chunk ID: the numbers shift on every reindex.
 */
const targets = db
  .prepare(
    `select c.id, c.locator, c.text from chunks c join works w on w.id = c.work_id
      where w.author like '%Hegel%' and w.title like '%Philosophy of Mind%'
        and c.locator like '%Mind Objective%'
        and (c.text like '%Universal History%' or c.text like '%history of the world%'
             or c.text like '%world-history%' or c.text like '%World-spirit%')
      order by c.id`,
  )
  .all() as { id: number; locator: string; text: string }[];

console.log(`\n${targets.length} stycken ur Weltgeschichte-avsnittet:\n`);
for (const t of targets)
  console.log(`  #${t.id}  ${t.text.replace(/\s+/g, " ").slice(0, 110)}…`);

const vecStmt = db.prepare(
  "select chunk_id as chunkId from vec_chunks where embedding match ? and k = ? order by distance",
);
const ftsStmt = db.prepare(
  `select c.id as chunkId from chunks_fts f join chunks c on c.id = f.rowid
    where chunks_fts match ? and c.is_front_matter = 0 order by bm25(chunks_fts) limit ?`,
);
const distStmt = db.prepare(
  "select vec_distance_cosine(embedding, ?) as d from vec_chunks where chunk_id = ?",
);

// The branches, and for each branch also the distance to the passage that just made it
// in at rank 100 — that's the threshold a target passage should be compared against.
const branches: { label: string; ids: number[] }[] = [];
const cutoffs: (number | null)[] = [];
const embeddings: Float32Array[] = [];

for (const [i, p] of HYDE.entries()) {
  const emb = await embedQuery(p);
  embeddings.push(emb);
  const ids = (
    vecStmt.all(vecBlob(emb), BRANCH_LIMIT) as { chunkId: number }[]
  ).map((r) => r.chunkId);
  branches.push({ label: `vektor ${"abcd"[i]}`, ids });
  const last = ids[ids.length - 1];
  cutoffs.push(
    (distStmt.get(vecBlob(emb), last) as { d: number } | undefined)?.d ?? null,
  );
}
branches.push({
  label: "BM25",
  ids: (
    ftsStmt.all(toFtsQuery(KEYWORDS), BRANCH_LIMIT) as { chunkId: number }[]
  ).map((r) => r.chunkId),
});

const acc = new Map<number, number>();
for (const { ids } of branches)
  ids.forEach((id, rank) =>
    acc.set(id, (acc.get(id) ?? 0) + 1 / (RRF_K + rank + 1)),
  );
const fused = [...acc.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

console.log(
  `\nfusionslistan: ${fused.length} stycken, cross-encodern läser ${POOL}\n`,
);
for (const t of targets) {
  const inBranch = branches
    .map((b) => {
      const at = b.ids.indexOf(t.id);
      return at === -1 ? null : `${b.label} ${at + 1}`;
    })
    .filter(Boolean);
  const at = fused.indexOf(t.id);
  console.log(
    `  #${t.id}  grenar: ${inBranch.length ? inBranch.join(", ") : "ingen"}   ` +
      `fusion: ${at === -1 ? "—" : at + 1}`,
  );
  // How far outside the threshold the passage sits in each vector branch. A passage that
  // misses by 0.01 is something else than one that misses by 0.15.
  const gaps = embeddings.map((emb, i) => {
    const d = (distStmt.get(vecBlob(emb), t.id) as { d: number } | undefined)
      ?.d;
    const cut = cutoffs[i];
    return d === undefined || cut === null
      ? "  –  "
      : `${d.toFixed(3)}${d <= cut ? "*" : ` (+${(d - cut).toFixed(3)})`}`;
  });
  console.log(`         avstånd/tröskel per register: ${gaps.join("   ")}`);
}

// What the cross-encoder would give them, compared to what it gave the winner and the
// last one that made it in among the 28.
const meta = db.prepare(
  `select w.author, w.title, c.text from chunks c join works w on w.id = c.work_id where c.id = ?`,
);
const poolRows = fused
  .slice(0, POOL)
  .map((id) => ({
    id,
    ...(meta.get(id) as { author: string; title: string; text: string }),
  }))
  .filter((r) => r.author !== undefined);

const all = [
  ...poolRows,
  ...targets.map((t) => ({
    id: t.id,
    author: "Hegel",
    title: "Philosophy of Mind (Weltgeschichte)",
    text: t.text,
  })),
];
const scores = await scorePairs(
  all.map((r) => ({ query: QUERY_EN, passage: r.text })),
);
const ranked = all
  .map((r, i) => ({ ...r, score: scores[i] }))
  .sort((a, b) => b.score - a.score);

console.log(
  `\nom Weltgeschichte-styckena poängsattes tillsammans med poolen:\n`,
);
ranked.forEach((r, i) => {
  const hit = targets.some((t) => t.id === r.id);
  if (i < 12 || hit)
    console.log(
      ` ${hit ? "«" : " "}${String(i + 1).padStart(3)}. ${r.score.toFixed(3)}  ${r.author} — ${r.title.slice(0, 46)}`,
    );
});
