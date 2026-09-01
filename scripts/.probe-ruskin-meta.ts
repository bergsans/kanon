/**
 * Step 5: the two side discoveries — metadata and a missing volume.
 *
 * The manifest has 25 Ruskin works, the database 24. And all 24 carry genre "philosophy"
 * and year 1900, which is the death year and not the publication year for any of them:
 * *The Poetry of Architecture* is 1837, *Stones of Venice* 1851–53. The year
 * drives the era filter, the genre the subject filter — both branches filter on them.
 */
import { getDb } from "../src/lib/db";
import { CORPUS } from "../src/lib/corpus";

const db = getDb();

const inDb = new Set(
  (db.prepare("select id from works where author like '%Ruskin%'").all() as { id: string }[]).map(
    (r) => r.id,
  ),
);
const inManifest = CORPUS.filter((w) => w.author.includes("Ruskin"));
console.log(`manifest: ${inManifest.length}   databas: ${inDb.size}`);
for (const w of inManifest) if (!inDb.has(w.id)) console.log(`  SAKNAS I DB: ${w.id} (${w.title})`);

/* How widespread is the placeholder year? */
const years = db
  .prepare(
    `select year, count(*) as n from works group by year order by n desc limit 8`,
  )
  .all() as { year: number; n: number }[];
console.log(`\nvanligaste årtalen i works:`);
for (const y of years) console.log(`  ${y.year}: ${y.n} verk`);

const round = db
  .prepare(`select count(*) as n from works where year % 50 = 0`)
  .get() as { n: number };
const total = db.prepare(`select count(*) as n from works`).get() as { n: number };
console.log(`  verk med årtal delbart med 50: ${round.n} av ${total.n}`);

/* What Ruskin's genre does to a subject filter. */
const genres = db
  .prepare(`select genre, count(*) as n from works where author like '%Ruskin%' group by genre`)
  .all() as { genre: string; n: number }[];
console.log(`\nRuskins genrer: ${genres.map((g) => `${g.genre} ${g.n}`).join(", ")}`);

/* Does the argument appear verbatim in the works that DO exist? */
const hits = db
  .prepare(
    `select w.title, c.locator, c.text from chunks_fts f
       join chunks c on c.id = f.rowid join works w on w.id = c.work_id
      where chunks_fts match ? and w.author like '%Ruskin%' and c.is_front_matter = 0
      order by bm25(chunks_fts) limit 5`,
  )
  .all('"national" AND "character" AND "architecture"') as {
  title: string;
  locator: string | null;
  text: string;
}[];
console.log(`\nRuskinstycken med "national" ∧ "character" ∧ "architecture": ${hits.length}`);
for (const h of hits) {
  console.log(`  ${h.title.slice(0, 34).padEnd(34)} ${h.text.replace(/\s+/g, " ").slice(0, 130)}`);
}
