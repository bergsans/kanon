/**
 * Part three: can the exact branch's cost be shared across the four registers?
 *
 * Parts one and two gave a linear exact branch — 36 µs per passage, independent of the query.
 * If that cost is row fetching and blob decoding, and not the distance
 * calculation itself (384 multiplications, a fraction of a microsecond), then
 * a single scan computing all four distances per row should cost nearly the same as
 * one computing a single distance. Retrieval does four vector branches on the same query plan, so
 * that would be four times cheaper for the same result.
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

for (const genre of ["drama", "religion"]) {
  const ids = (
    db
      .prepare(
        `select c.id from chunks c join works w on w.id = c.work_id
          where w.genre = ? and c.is_front_matter = 0`,
      )
      .all(genre) as { id: number }[]
  ).map((r) => r.id);
  console.log(`\n════ ${genre}: ${ids.length.toLocaleString("sv-SE")} stycken`);

  /* One query per register, as part one did. */
  let t0 = performance.now();
  const separate: number[][] = [];
  for (const blob of blobs) {
    const scored: { chunkId: number; d: number }[] = [];
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      const slice = ids.slice(i, i + ID_BATCH);
      scored.push(
        ...(db
          .prepare(
            `select chunk_id as chunkId, vec_distance_cosine(embedding, ?) as d
               from vec_chunks where chunk_id in (${slice.map(() => "?").join(",")})
              order by d limit ?`,
          )
          .all(blob, ...slice, BRANCH_LIMIT) as { chunkId: number; d: number }[]),
      );
    }
    separate.push(
      scored.sort((a, b) => a.d - b.d).slice(0, BRANCH_LIMIT).map((r) => r.chunkId),
    );
  }
  const separateMs = performance.now() - t0;

  /* All four distances in the same scan, top lists picked in JS. */
  t0 = performance.now();
  const tops: { chunkId: number; d: number }[][] = [[], [], [], []];
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const slice = ids.slice(i, i + ID_BATCH);
    const rows = db
      .prepare(
        `select chunk_id as chunkId,
                vec_distance_cosine(embedding, ?) as d0,
                vec_distance_cosine(embedding, ?) as d1,
                vec_distance_cosine(embedding, ?) as d2,
                vec_distance_cosine(embedding, ?) as d3
           from vec_chunks where chunk_id in (${slice.map(() => "?").join(",")})`,
      )
      .all(...blobs, ...slice) as Record<string, number>[];
    for (const row of rows) {
      for (let b = 0; b < 4; b++) tops[b].push({ chunkId: row.chunkId, d: row[`d${b}`] });
    }
    // Trim per batch so the lists don't grow to the whole genre's size in memory.
    for (const t of tops) {
      t.sort((a, b) => a.d - b.d);
      t.length = Math.min(t.length, BRANCH_LIMIT);
    }
  }
  const togetherMs = performance.now() - t0;

  const same = tops.map(
    (t, b) =>
      t.filter((r) => separate[b].includes(r.chunkId)).length + "/" + BRANCH_LIMIT,
  );
  console.log(`   fyra frågor:      ${separateMs.toFixed(0).padStart(6)} ms`);
  console.log(`   en genomsökning:  ${togetherMs.toFixed(0).padStart(6)} ms`);
  console.log(`   samma topplistor: ${same.join("  ")}`);
}
