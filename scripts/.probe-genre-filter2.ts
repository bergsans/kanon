/**
 * Part two of `.probe-genre-filter.ts`: what does today's unfiltered branch cost, where
 * does the oversampling go, and what does the picture look like across all ten genres?
 *
 * Part one gave two numbers that didn't add up: the exact branch costs 36 µs per passage
 * (7.4 s for philosophy) and the oversampled version only hits right when the genre is large.
 * Before the choice can be made, the budget must be known — what an ordinary vector branch
 * costs today — and the boundary between "large" and "narrow" must be measured rather than guessed.
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";

const db = getDb();
const BRANCH_LIMIT = 100;
const ID_BATCH = 5000;

const HYDE = [
  "It is the part of the philosopher to inquire whether the successive ages of mankind exhibit a true advance, or whether the appearance of improvement be but a shifting of the same passions into new forms.",
  "Among the tribes of the interior we found no memory of any ancestor beyond the third generation, nor any tradition of a golden age. Their implements of stone differ little from those disinterred in the barrows of our own country.",
  "And is it your opinion, sir, that the world grows better? Nay, said he, I have seen too many winters. The son builds where the father burned, and the grandson burns again what was built.",
  "It is the necessity of the Idea that it pass through its own negation and return to itself enriched, so that what seems the ruin of one age is but the labour-pain of the next; the World-Spirit climbs toward its own perfect self-consciousness.",
];
const blobs = await Promise.all(HYDE.map(async (p) => vecBlob(await embedQuery(p))));

function ms(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

/* 1. The budget: what a branch costs today, with no filter and no join. */
const knn = db.prepare(
  "select chunk_id as chunkId from vec_chunks where embedding match ? and k = ? order by distance",
);
console.log("── dagens ofiltrerade gren (ingen join)");
for (const k of [100, 400, 1000, 4096]) {
  const each = blobs.map((b) => ms(() => knn.all(b, k)));
  console.log(
    `   k=${String(k).padStart(4)}  ${each.map((m) => m.toFixed(0).padStart(4)).join(" ")} ms` +
      `   snitt ${(each.reduce((a, b) => a + b) / each.length).toFixed(0)} ms`,
  );
}

/* 2. Where the cost sits in the oversampled branch: the KNN or the join? */
const joined = db.prepare(
  `with knn as (select chunk_id, distance from vec_chunks where embedding match ? and k = ?)
   select knn.chunk_id from knn
     join chunks c on c.id = knn.chunk_id
     join works w on w.id = c.work_id
    where w.genre = ? and c.is_front_matter = 0
    order by knn.distance limit ?`,
);
console.log("\n── samma KNN med genrejoin ovanpå");
for (const k of [400, 4096]) {
  const each = blobs.map((b) => ms(() => joined.all(b, k, "filosofi", BRANCH_LIMIT)));
  console.log(
    `   k=${String(k).padStart(4)}  snitt ${(each.reduce((a, b) => a + b) / each.length).toFixed(0)} ms`,
  );
}

/* 3. All ten genres: does oversampling fill a hundred slots, and what does exact cost? */
const sizes = db
  .prepare(
    `select w.genre, count(*) as n from chunks c join works w on w.id = c.work_id
      where c.is_front_matter = 0 group by w.genre order by n desc`,
  )
  .all() as { genre: string; n: number }[];
const total = sizes.reduce((s, r) => s + r.n, 0);

const idsFor = db.prepare(
  `select c.id from chunks c join works w on w.id = c.work_id
    where w.genre = ? and c.is_front_matter = 0`,
);

console.log("\n── per ämne: översamplat k=4096 mot exakt");
console.log("   ämne          andel   fyllda platser (fyra register)   exakt");
for (const { genre, n } of sizes) {
  const filled = blobs.map(
    (b) => (joined.all(b, 4096, genre, BRANCH_LIMIT) as unknown[]).length,
  );
  // Exact is only measured on one register — the cost depends on the genre's size, not on
  // the query, which part one showed (36 µs per passage, linear across three sizes).
  const ids = (idsFor.all(genre) as { id: number }[]).map((r) => r.id);
  const exactMs = ms(() => {
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      const slice = ids.slice(i, i + ID_BATCH);
      db.prepare(
        `select chunk_id, vec_distance_cosine(embedding, ?) as d from vec_chunks
          where chunk_id in (${slice.map(() => "?").join(",")}) order by d limit ?`,
      ).all(blobs[0], ...slice, BRANCH_LIMIT);
    }
  });
  console.log(
    `   ${genre.padEnd(12)} ${((100 * n) / total).toFixed(1).padStart(5)} %   ` +
      `${filled.map((f) => String(f).padStart(3)).join("  ")}   ` +
      `${exactMs.toFixed(0).padStart(6)} ms  (${n.toLocaleString("sv-SE")} st)`,
  );
}
