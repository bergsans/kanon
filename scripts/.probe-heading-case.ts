/**
 * How many non-English locators look like they went through the blanket
 * English-style Title Case `normalizeHeading()` (`chunk.ts`) applies to
 * every all-caps heading, regardless of the work's language.
 *
 *   pnpm tsx scripts/.probe-heading-case.ts
 *
 * A heading is only rewritten when the source text had it in ALL CAPS —
 * `chunk.ts`'s own condition, `cleaned === cleaned.toUpperCase()` — and the
 * database doesn't keep the pre-rewrite form, so this can't measure the
 * transform directly. Instead: every space-separated word capitalized, in a
 * work whose language isn't English, is what that transform's *output*
 * looks like and what ordinary running prose in Swedish, French, German,
 * Italian or Latin essentially never produces on its own — a locator with
 * "Och", "Och", "Der", "Et", "Di" capitalized mid-line reads as the
 * transform having run, not as how the author wrote it.
 *
 * Only reads the database. Costs nothing, calls nothing.
 */
import { getDb } from "../src/lib/db";

const db = getDb();

const rows = db
  .prepare(
    `select distinct c.locator, w.language, w.author, w.title
       from chunks c join works w on w.id = c.work_id
      where c.locator is not null and c.locator != '' and w.language != 'en'`,
  )
  .all() as { locator: string; language: string; author: string; title: string }[];

/** Every word starts with an uppercase letter, and there's more than one word. */
function looksTitleCased(locator: string): boolean {
  const words = locator.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words.every((w) => /^\p{Lu}/u.test(w));
}

const byLanguage = new Map<string, { total: number; flagged: string[] }>();
for (const r of rows) {
  const bucket = byLanguage.get(r.language) ?? { total: 0, flagged: [] };
  bucket.total++;
  if (looksTitleCased(r.locator)) {
    bucket.flagged.push(`${r.locator}  —  ${r.author}, ${r.title.slice(0, 40)}`);
  }
  byLanguage.set(r.language, bucket);
}

console.log(`${rows.length} distinct non-English locators across the collection.\n`);
for (const [lang, { total, flagged }] of [...byLanguage.entries()].sort()) {
  const pct = total > 0 ? ((flagged.length / total) * 100).toFixed(0) : "0";
  console.log(`${lang}: ${flagged.length}/${total} (${pct}%) look Title-Cased`);
  for (const example of flagged.slice(0, 8)) console.log(`    ${example}`);
  if (flagged.length > 8) console.log(`    … and ${flagged.length - 8} more`);
  console.log();
}
