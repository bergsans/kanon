/**
 * The Bible's locators, and the threshold that decides what counts as scripture.
 *
 *   pnpm tsx scripts/.probe-bible-locator.ts
 *
 * The Bible was indexed with 5,416 paragraphs and `locator: null` on every single
 * one: the KJV puts its subdivisions as verse numbers in the body text
 * ("1:1 In the beginning") and its book headings with the keyword in the middle of
 * the line, and `RULES.en` catches neither. Scripture is the collection's only work
 * where chapter and verse ARE the locator, so it was also the work that lost the
 * most from lacking them.
 *
 * The probe answers three questions:
 *
 *   1. Does the new approach find all 66 books, and do the names become citable?
 *   2. How many paragraphs get a locator, and how many are left without?
 *   3. Is `VERSE_MINIMUM` safe — does the pattern trip up some OTHER work in the
 *      collection?
 *
 * Question 3 is the one that justifies the number, and it needs the whole of
 * `data/texts`. Only reads files on disk and calls no model: free, no
 * `ANTHROPIC_API_KEY`.
 */
import fs from "node:fs";
import path from "node:path";
import { chunkText } from "../src/lib/chunk";
import { CORPUS, WORK_BY_ID } from "../src/lib/corpus";

const TEXTS = path.join(process.cwd(), "data", "texts");
const BIBLE_ID = "bibeln-the-king-james-version-of-the-bible";

/** Same pattern as `VERSE_RE` in chunk.ts. The probe measures the threshold, not the rules. */
const VERSE_RE = /^(\d+):\d+\s/;

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── 1 and 2: the Bible ──────────────────────────────────────────────────────────

const biblePath = path.join(TEXTS, `${BIBLE_ID}.txt`);
if (!fs.existsSync(biblePath)) {
  console.error(
    `saknas: ${biblePath} — kör pnpm ingest --only=${BIBLE_ID} först`,
  );
  process.exit(1);
}

const raw = fs.readFileSync(biblePath, "utf8");
const chunks = chunkText(raw, "en");

const body = chunks.filter((c) => !c.isFrontMatter);
const withLocator = body.filter((c) => c.locator !== null);

// The book is everything except the last word of the locator ("1 Corinthians 13").
const bookOf = (loc: string) => loc.replace(/\s+\d+$/, "");
const books: string[] = [];
const chapters = new Map<string, Set<string>>();
for (const c of body) {
  if (!c.locator) continue;
  const b = bookOf(c.locator);
  if (!chapters.has(b)) {
    chapters.set(b, new Set());
    books.push(b);
  }
  chapters.get(b)!.add(c.locator);
}

console.log(
  `Bibeln: ${chunks.length} stycken, varav ${chunks.length - body.length} förtext`,
);
console.log(
  `hänvisning: ${withLocator.length} / ${body.length} brödtextstycken ` +
    `(${((withLocator.length / body.length) * 100).toFixed(1)} %)`,
);
console.log(
  `${books.length} böcker, ${[...chapters.values()].reduce((s, v) => s + v.size, 0)} kapitel\n`,
);

console.log("böckerna som de kommer att citeras:");
for (let i = 0; i < books.length; i += 4) {
  console.log(
    "  " +
      books
        .slice(i, i + 4)
        .map((b) => `${b} (${chapters.get(b)!.size})`.padEnd(24))
        .join(""),
  );
}

const missing = body.filter((c) => c.locator === null);
if (missing.length > 0) {
  console.log(`\n${missing.length} stycken utan hänvisning:`);
  for (const c of missing.slice(0, 5))
    console.log(`  ${c.text.replace(/\s+/g, " ").slice(0, 90)}`);
}

console.log("\nstickprov:");
for (const q of [
  "Genesis 1",
  "Job 38",
  "Psalms 23",
  "Ecclesiastes 3",
  "1 Corinthians 13",
]) {
  const hit = body.find((c) => c.locator === q);
  console.log(
    `  ${q.padEnd(18)} ${hit ? hit.text.replace(/\s+/g, " ").slice(0, 76) : "SAKNAS"}`,
  );
}

// ── 3: the threshold against the whole collection ───────────────────────────────

const counts: { id: string; verses: number; paras: number; share: number }[] =
  [];
for (const w of CORPUS) {
  const file = path.join(TEXTS, `${w.id}.txt`);
  if (!fs.existsSync(file)) continue;
  const paras = paragraphs(fs.readFileSync(file, "utf8"));
  const verses = paras.filter((p) => VERSE_RE.test(p)).length;
  if (verses > 0)
    counts.push({
      id: w.id,
      verses,
      paras: paras.length,
      share: verses / paras.length,
    });
}
counts.sort((a, b) => b.verses - a.verses);

console.log(
  `\n${counts.length} av samlingens hämtade texter har minst ett versnumrerat stycke.`,
);
console.log("de tio översta:");
for (const c of counts.slice(0, 10)) {
  const w = WORK_BY_ID.get(c.id);
  console.log(
    `  ${String(c.verses).padStart(6)} / ${String(c.paras).padStart(6)} st ` +
      `${(c.share * 100).toFixed(1).padStart(5)} %  ${w?.author ?? "?"} — ${(w?.title ?? c.id).slice(0, 48)}`,
  );
}

const second = counts[1];
console.log(
  `\nMarginal: Bibeln ${counts[0]?.verses} versstycken, näst högsta ${second?.verses ?? 0}. ` +
    `Tröskeln 500 ligger mellan dem.`,
);
