/**
 * Where does the time go in a filtered retrieval?
 *
 * `.probe-filter-live.ts` clocked a filtered search at 15 s against ~1.2 s for the
 * four unfiltered vector branches. The difference is too large to be the branches
 * alone, and a latency you can't point to is a latency you can't reduce.
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";

const db = getDb();
const HYDE = [
  "It is the part of the philosopher to inquire whether the successive ages of mankind exhibit a true advance, or whether the appearance of improvement be but a shifting of the same passions into new forms.",
  "Among the tribes of the interior we found no memory of any ancestor beyond the third generation, nor any tradition of a golden age.",
  "And is it your opinion, sir, that the world grows better? Nay, said he, I have seen too many winters.",
  "It is the necessity of the Idea that it pass through its own negation and return to itself enriched.",
];
const KW = `"progress" OR "decline" OR "civilization" OR "savage" OR "manners" OR "corruption" OR "luxury"`;

async function ms<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  console.log(`   ${label.padEnd(38)} ${(performance.now() - t0).toFixed(0).padStart(6)} ms`);
  return out;
}

// The model is loaded once; that cost doesn't belong to a search.
await embedQuery("uppvärmning");

console.log("\n── embedding");
const blobs: Buffer[] = [];
for (const [i, p] of HYDE.entries()) {
  blobs.push(vecBlob(await ms(`embedQuery ${i + 1}`, () => embedQuery(p))));
}

console.log("\n── vektorgrenen, ofiltrerad (k=100)");
const plain = db.prepare(
  "select chunk_id as chunkId from vec_chunks where embedding match ? and k = ? order by distance",
);
for (const [i, b] of blobs.entries()) await ms(`KNN ${i + 1}`, () => plain.all(b, 100));

console.log("\n── vektorgrenen, filtrerad på dikt (k=400 → 4096)");
const filtered = db.prepare(
  `with knn as (select chunk_id, distance from vec_chunks where embedding match ? and k = ?)
   select knn.chunk_id from knn
     join chunks c on c.id = knn.chunk_id
     join works w on w.id = c.work_id
    where c.is_front_matter = 0 and w.genre in (?)
    order by knn.distance limit 100`,
);
for (const [i, b] of blobs.entries()) {
  await ms(`KNN ${i + 1} k=400`, () => filtered.all(b, 400, "dikt"));
}

console.log("\n── nyckelordsgrenen");
await ms("BM25 utan filter", () =>
  db
    .prepare(
      `select c.id from chunks_fts f join chunks c on c.id = f.rowid
        where chunks_fts match ? and c.is_front_matter = 0
        order by bm25(chunks_fts) limit 100`,
    )
    .all(KW),
);
await ms("BM25 med genrejoin", () =>
  db
    .prepare(
      `select c.id from chunks_fts f join chunks c on c.id = f.rowid
         join works w on w.id = c.work_id
        where chunks_fts match ? and c.is_front_matter = 0 and w.genre in (?)
        order by bm25(chunks_fts) limit 100`,
    )
    .all(KW, "dikt"),
);

console.log("\n── urvalets storlek (körs en gång per sökning)");
await ms("selectionShare, dikt", () =>
  db
    .prepare(
      `select sum(case when 1 = 1 and w.genre in (?) then 1 else 0 end) as selected,
              count(*) as total
         from chunks c join works w on w.id = c.work_id
        where c.is_front_matter = 0`,
    )
    .get("dikt"),
);

console.log("\n── epokernas storlek");
const eras = db
  .prepare(
    `select w.era, count(*) as n from chunks c join works w on w.id = c.work_id
      where c.is_front_matter = 0 group by w.era order by n desc`,
  )
  .all() as { era: string; n: number }[];
const total = eras.reduce((s, r) => s + r.n, 0);
for (const { era, n } of eras) {
  console.log(
    `   ${era.padEnd(12)} ${((100 * n) / total).toFixed(1).padStart(5)} %  ${n.toLocaleString("sv-SE").padStart(9)} stycken` +
      `  exakt ≈ ${((69e-6 * n)).toFixed(1)} s`,
  );
}
