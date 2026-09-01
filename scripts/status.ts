/**
 * How far the indexing has progressed.
 *
 *   pnpm status
 *
 * Reads the database and the manifest, not the log — so it answers correctly
 * even if `pnpm ingest` ran in another window, was interrupted, and restarted.
 */
import { CORPUS } from "../src/lib/corpus";
import { getDb } from "../src/lib/db";

const db = getDb();

const indexed = db
  .prepare("select id, genre from works where chunk_count > 0")
  .all() as { id: string; genre: string }[];
const done = new Set(indexed.map((w) => w.id));
const { chunks } = db
  .prepare("select count(*) as chunks from vec_chunks")
  .get() as {
  chunks: number;
};

const remaining = CORPUS.filter((w) => !done.has(w.id));
const pct = (100 * done.size) / CORPUS.length;

console.log(
  `\n${done.size} / ${CORPUS.length} verk indexerade  (${pct.toFixed(1)} %)`,
);
console.log(`${chunks.toLocaleString("sv-SE")} sökbara stycken`);

if (remaining.length === 0) {
  console.log("\n✓ Klart — hela manifestet är indexerat.");
} else {
  // The average from what has already been processed is the only estimate we
  // have that isn't a guess. It's crude: works' lengths vary tenfold.
  const perWork = chunks / Math.max(done.size, 1);
  console.log(
    `\n${remaining.length} verk kvar — ca ${Math.round((perWork * remaining.length) / 1000)}k stycken att embedda.`,
  );
}

/* -------- per genre: shows whether the breadth has actually made it into the index -------- */
const target = new Map<string, number>();
for (const w of CORPUS) target.set(w.genre, (target.get(w.genre) ?? 0) + 1);
const have = new Map<string, number>();
for (const w of indexed) have.set(w.genre, (have.get(w.genre) ?? 0) + 1);

console.log("");
for (const [genre, total] of [...target].sort((a, b) => b[1] - a[1])) {
  const n = have.get(genre) ?? 0;
  const filled = Math.round((20 * n) / total);
  console.log(
    `  ${genre.padEnd(12)} ${"█".repeat(filled)}${"·".repeat(20 - filled)} ${String(n).padStart(4)}/${total}`,
  );
}
console.log("");
