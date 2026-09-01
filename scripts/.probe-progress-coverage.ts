/**
 * Free check ahead of the query "does progress happen in history": are the authors
 * one expects an answer from actually in the index, or only in the manifest?
 *
 * Indexing stands at 61.5% — a missing hit could just as well be a work that
 * hasn't been embedded yet as a fetch that fails. The two errors require entirely
 * different fixes, so they must be told apart before touching the retrieval chain.
 */
import { CORPUS } from "../src/lib/corpus";
import { getDb } from "../src/lib/db";

const db = getDb();
const rows = db
  .prepare("select id, chunk_count from works where chunk_count > 0")
  .all() as { id: string; chunk_count: number }[];
const done = new Map(rows.map((r) => [r.id, r.chunk_count]));

const names = [
  "Schopenhauer", "Nietzsche", "Hegel", "Kant", "Marx", "Engels",
  "Comte", "Condorcet", "Spencer", "Buckle", "Guizot", "Bury",
  "Gibbon", "Rousseau", "Tocqueville", "Ferguson", "Tylor",
];

for (const n of names) {
  const works = CORPUS.filter((w) => w.author.includes(n));
  if (!works.length) {
    console.log(`\n### ${n} — saknas i manifestet`);
    continue;
  }
  const inIndex = works.filter((w) => done.has(w.id));
  const chunks = inIndex.reduce((s, w) => s + (done.get(w.id) ?? 0), 0);
  console.log(
    `\n### ${n}: ${inIndex.length}/${works.length} verk indexerade, ${chunks} stycken`,
  );
  for (const w of works) {
    const c = done.get(w.id);
    console.log(`   ${c ? String(c).padStart(6) + " st " : "   ej idx "} ${w.title}`);
  }
}
