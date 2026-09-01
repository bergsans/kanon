/**
 * Works in the database that no longer exist in any manifest.
 *
 *   pnpm tsx scripts/.probe-orphans.ts          list them
 *   pnpm tsx scripts/.probe-orphans.ts --delete delete them
 *
 * Arises when a generator's ID form changes: the old rows stay behind and
 * retrieval serves the same work twice, once per ID. It happened when the
 * French part's ID got the source's number appended to tell multi-volume works apart —
 * 134 works were then left under their old IDs.
 *
 * `pnpm ingest` doesn't clean this up: it walks the manifest and never touches rows
 * the manifest doesn't know about. Only reads the database, costs nothing.
 */
import { CORPUS } from "../src/lib/corpus";
import { deleteWork, getDb } from "../src/lib/db";

const db = getDb();
const known = new Set(CORPUS.map((w) => w.id));
const rows = db
  .prepare("select id, source, language, author, title, chunk_count from works")
  .all() as {
  id: string;
  source: string;
  language: string;
  author: string;
  title: string;
  chunk_count: number;
}[];

const orphans = rows.filter((r) => !known.has(r.id));

console.log(
  `${rows.length} verk i databasen, ${known.size} i manifesten, ${orphans.length} föräldralösa`,
);
for (const o of orphans.slice(0, 20)) {
  console.log(`  ${String(o.chunk_count).padStart(5)} st  ${o.author} — ${o.title.slice(0, 52)}`);
}
if (orphans.length > 20) console.log(`  … och ${orphans.length - 20} till`);

if (!process.argv.includes("--delete")) {
  if (orphans.length > 0) console.log("\nKör med --delete för att ta bort dem.");
  process.exit(0);
}

let chunks = 0;
for (const o of orphans) {
  chunks += o.chunk_count;
  deleteWork(db, o.id);
}
console.log(`\nTog bort ${orphans.length} verk och ${chunks} stycken.`);
