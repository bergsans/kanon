/**
 * What does a genre-restricted vector branch cost, and can it be oversampled?
 *
 * The genre filter has to live in retrieval's branches. The BM25 branch and the mention
 * branch are trivial — one more condition in a join. The vector branch isn't: vec0's KNN
 * searches the whole index and can't accept a genre condition, so there are only two
 * paths, and they have different failure modes.
 *
 *   exact         compute the distance directly against the genre's passages, as mentionBranch does.
 *                 Never a missed hit; the cost grows with the genre's size.
 *   oversampled   ordinary KNN with a high k, filter by genre afterward. Nearly free;
 *                 a narrow genre can fall entirely outside the first k.
 *
 * The measurement is free and local — no Claude, no embedding of the collection, just
 * four query embeddings and SQL against data/canon.db.
 *
 * `.probe-progress-genre.ts` measured the exact branch once, but on 162,642 philosophy
 * passages. The collection has grown to 202,815 and that number no longer holds.
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";

const db = getDb();

/** One passage per register, as query expansion writes them. */
const HYDE: [string, string][] = [
  [
    "a traktat",
    "It is the part of the philosopher to inquire whether the successive ages of mankind exhibit a true advance, or whether the appearance of improvement be but a shifting of the same passions into new forms. If reason be the same in every age, and the ends of human action be fixed by nature, then what men call progress can be nothing more than the better ordering of unchanging materials.",
  ],
  [
    "b skildring",
    "Among the tribes of the interior we found no memory of any ancestor beyond the third generation, nor any tradition of a golden age. Their implements of stone differ little from those disinterred in the barrows of our own country; and the traveller who compares them perceives that the arts have everywhere advanced by the like stages.",
  ],
  [
    "c gestaltad",
    "And is it your opinion, sir, that the world grows better? Nay, said he, I have seen too many winters. The son builds where the father burned, and the grandson burns again what was built; and the historian, who calls this progress, does but flatter the age that feeds him.",
  ],
  [
    "d systembygge",
    "It is the necessity of the Idea that it pass through its own negation and return to itself enriched, so that what seems the ruin of one age is but the labour-pain of the next; the World-Spirit does not repeat itself vainly, but climbs, by the very contradictions that appear as decline, toward its own perfect self-consciousness.",
  ],
];

/** The same cap as BRANCH_LIMIT in search.ts — the branch should fill a hundred slots. */
const BRANCH_LIMIT = 100;

/**
 * The k values the oversampling is tried with. The cap isn't chosen: vec0 rejects k above
 * 4096 with "k value in knn query too large". That's itself a result — an
 * oversampled branch can never see more than 4,096 of the collection's 852,410 passages.
 */
const OVERSAMPLE = [400, 1000, 2000, 4096];

/** Three genres of different sizes: the collection's largest, one in between, one of the smallest. */
const GENRES = ["filosofi", "drama", "religion"];

const sizes = new Map(
  (
    db
      .prepare(
        `select w.genre, count(*) as n from chunks c join works w on w.id = c.work_id
          where c.is_front_matter = 0 group by w.genre`,
      )
      .all() as { genre: string; n: number }[]
  ).map((r) => [r.genre, r.n]),
);
const total = [...sizes.values()].reduce((a, b) => a + b, 0);

/** The same technique as mentionBranch: distances computed directly, batched. */
const ID_BATCH = 5000;

function exactBranch(ids: number[], blob: Buffer, k: number): number[] {
  const scored: { chunkId: number; d: number }[] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const slice = ids.slice(i, i + ID_BATCH);
    scored.push(
      ...(db
        .prepare(
          `select chunk_id as chunkId, vec_distance_cosine(embedding, ?) as d
             from vec_chunks
            where chunk_id in (${slice.map(() => "?").join(",")})
            order by d limit ?`,
        )
        .all(blob, ...slice, k) as { chunkId: number; d: number }[]),
    );
  }
  return scored
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((r) => r.chunkId);
}

/**
 * KNN over the whole index, then filtered by genre. The KNN sits in a CTE so that
 * the genre condition is applied after the match and doesn't get pushed into
 * vec0's own query, which can't accept it.
 */
function oversampledBranch(
  genre: string,
  blob: Buffer,
  k: number,
  limit: number,
) {
  const t0 = performance.now();
  const rows = db
    .prepare(
      `with knn as (
         select chunk_id, distance from vec_chunks
          where embedding match ? and k = ?
       )
       select knn.chunk_id as chunkId from knn
         join chunks c on c.id = knn.chunk_id
         join works w on w.id = c.work_id
        where w.genre = ? and c.is_front_matter = 0
        order by knn.distance
        limit ?`,
    )
    .all(blob, k, genre, limit) as { chunkId: number }[];
  return { ids: rows.map((r) => r.chunkId), ms: performance.now() - t0 };
}

function overlap(a: number[], b: number[]): number {
  const set = new Set(b);
  return a.filter((id) => set.has(id)).length;
}

for (const genre of GENRES) {
  const n = sizes.get(genre) ?? 0;
  console.log(
    `\n════ ${genre}: ${n.toLocaleString("sv-SE")} stycken ` +
      `(${((100 * n) / total).toFixed(1)} % av samlingens ${total.toLocaleString("sv-SE")})`,
  );

  const ids = (
    db
      .prepare(
        `select c.id from chunks c join works w on w.id = c.work_id
          where w.genre = ? and c.is_front_matter = 0`,
      )
      .all(genre) as { id: number }[]
  ).map((r) => r.id);

  for (const [label, passage] of HYDE) {
    const blob = vecBlob(await embedQuery(passage));

    const t0 = performance.now();
    const exact = exactBranch(ids, blob, BRANCH_LIMIT);
    const exactMs = performance.now() - t0;

    const line = OVERSAMPLE.map((k) => {
      const { ids: got, ms } = oversampledBranch(genre, blob, k, BRANCH_LIMIT);
      const hit = overlap(got, exact);
      return `k=${k}: ${String(got.length).padStart(3)} st, ${hit}/${BRANCH_LIMIT} rätt, ${ms.toFixed(0)} ms`;
    });

    console.log(
      `  ${label.padEnd(14)} exakt ${exactMs.toFixed(0).padStart(5)} ms`,
    );
    for (const l of line) console.log(`                 ${l}`);
  }
}
