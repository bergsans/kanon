/**
 * The shared part of Gutenberg's non-English manifests.
 *
 * `build-corpus-fr.ts` and `build-corpus-it.ts` are thin files that only carry
 * their language, their author list, and their output file. Everything else —
 * catalog reading, fetching, the duplicate-ID key, the report — is the same for
 * both, and a copy per language would be two places to fix the same bug.
 *
 * They still each write *their own manifest*, and that's the point of them
 * being separate commands: rebuilding the Italian one shouldn't be able to
 * disturb the French one. The same reason `corpus.ts` gives for the Gutenberg
 * and Litteraturbanken parts being two files.
 *
 * THE SOURCE IS GUTENBERG, THE SAME AS THE ENGLISH PART. The French and Italian
 * canon needed no new source: `build-corpus.ts` filters on `language === "en"`
 * and thereby discards 4,168 French and 1,103 Italian texts on every run.
 * Fetching, the license header, and edition verification are handled by the
 * same `gutenberg.ts`, and the rights basis is the same — public domain.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "../src/lib/db";
import { fetchRaw, stripBoilerplate, verifyHeader } from "../src/lib/gutenberg";
import { chunkText } from "../src/lib/chunk";
import type { CanonWork, Genre, Language } from "../src/lib/corpus";
import { eraOf } from "./lib/era";
import { assertNoDuplicateIds, writeManifest } from "./lib/manifest";
import { parseCsv } from "./lib/csv";

const CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";

/** Maximum number of works per author. A cap, not a target. */
const MAX_WORKS_PER_AUTHOR = 10;

/**
 * The protection term in Sweden and the EU: the author's lifetime plus seventy years.
 *
 * Gutenberg's catalog is free *in the US*, and the two bases diverge as soon as
 * a list reaches the 20th century. The German part is the case that made this
 * check necessary: the catalog has Hesse (d. 1962) with 21 entries, Thomas Mann
 * (1955) with 10, and Kellermann (1951) with 11 — all well-matched, all
 * protected here.
 *
 * THE ENGLISH PART TAKES A DIFFERENT ROUTE, and that's a deliberate choice, not
 * an oversight: `build-corpus.ts` carries Russell, Eliot, Lewis, Moore, Mann,
 * Woolf and Joyce on Gutenberg's own judgment, with the reason spelled out at
 * those rows. That choice applies to that list and shouldn't be extended here
 * out of momentum — hence this check, which rejects a name someone entered, not
 * a catalog entry.
 *
 * Same figure and same shape as `build-corpus-mia.ts`: a line in the report and
 * a skipped name, not an aborted build. A protected name staying in the list is
 * a record of what's been tried, just like MIA's Luxemburg and Kollontai.
 */
const PROTECTION_YEARS = 70;

/** The shortest a text may be and still become a work. Same figure as the Perseus part. */
const MIN_CHARS = 12_000;

/**
 * The fewest searchable paragraphs a work may have and still be included.
 *
 * Character count alone isn't a sufficient measure: chunking can classify
 * almost everything as front matter, leaving a work large yet unsearchable.
 * Manzoni's *Brani inediti* is 690,000 characters and yields one paragraph.
 */
const MIN_BODY_CHUNKS = 10;

/**
 * Title words that mean the entry is a book *about* the author, not *by* them.
 *
 * Shorter than the Gutenberg part's list, because these catalogs are cleaner.
 * The words are deliberately shared between French and Italian: "vie
 * de"/"vita di", "correspondance"/"carteggio", and the selection of school
 * editions. A list per language would be more precise but two places to forget.
 */
const JUNK_TITLE =
  /\b(vie de|vita di|biographie|biografia|correspondance de|carteggio|lettere di|m(é|e)moires sur|morceaux choisis|extraits|scelt[ae] da|notice sur|(é|e)tude sur|studio su|dictionnaire|dizionario|catalogue|catalogo)\b/i;

export interface Author {
  /** The catalog's exact form, with dates. See `build-corpus.ts` for why. */
  name: string;
  display: string;
  genre: Genre;
  /** Year of death. Becomes `year`, era, and chronological sort order. */
  death: number;
}


const slug = (s: string) =>
  s.toLowerCase().replace(/[åäàáâãæ]/g, "a").replace(/[öòóôõø]/g, "o")
    .replace(/[éèêë]/g, "e").replace(/[üùúûç]/g, "u").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface Row {
  id: number;
  title: string;
  authors: string;
}

/** The catalog, filtered to one language's texts. Same file the Gutenberg part reads, same disk cache. */
async function catalogue(language: string): Promise<Row[]> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, "pg_catalog.csv");
  if (!fs.existsSync(cached)) {
    process.stdout.write("Hämtar Gutenbergs katalog… ");
    const res = await fetch(CATALOG_URL, {
      headers: { "User-Agent": "canon-indexer/0.2 (personal research project)" },
    });
    if (!res.ok) throw new Error(`Katalogen svarade ${res.status}`);
    fs.writeFileSync(cached, await res.text(), "utf8");
    console.log("klart");
  }
  const rows = parseCsv(fs.readFileSync(cached, "utf8"));
  const header = rows[0];
  const [cId, cTitle, cLang, cType, cAuth] = [
    "Text#", "Title", "Language", "Type", "Authors",
  ].map((n) => header.indexOf(n));

  return rows
    .slice(1)
    .filter((r) => r.length > cAuth && r[cLang] === language && r[cType] === "Text")
    .map((r) => ({ id: Number(r[cId]), title: r[cTitle], authors: r[cAuth] }))
    .filter((r) => Number.isFinite(r.id));
}

/**
 * The catalog's author field carries roles in brackets — `[Translator]`,
 * `[Editor]` — and multiple people separated by semicolons. An entry counts as
 * the author's own only when they're listed first and without a role;
 * otherwise Baudelaire's Poe translations become Baudelaire's own works.
 */
function isPrimary(authors: string, name: string): boolean {
  const first = authors.split(";")[0].trim();
  return first === name;
}

interface Candidate {
  id: number;
  title: string;
  chars: number;
  chunks: number;
  reason: string;
}

async function evaluate(row: Row, author: Author, language: Language): Promise<Candidate> {
  const work = {
    id: String(row.id),
    source: "gutenberg",
    sourceId: String(row.id),
    language,
    titleMatch: "",
    authorMatch: "",
  } as CanonWork;
  const base: Candidate = { id: row.id, title: row.title, chars: 0, chunks: 0, reason: "" };
  try {
    const raw = await fetchRaw(work);
    // The check against the file's own header runs here too, not only at
    // indexing time: an ID pointing at the wrong edition should fail in the
    // report, not go in silently.
    verifyHeader(raw, { ...work, authorMatch: author.name.split(",")[0].toLowerCase() });
    const text = stripBoilerplate(raw);
    const chunks = chunkText(text, language).filter((c) => !c.isFrontMatter);
    if (text.length < MIN_CHARS) {
      return { ...base, chars: text.length, chunks: chunks.length, reason: "för kort" };
    }
    // A work whose text is classified almost entirely as front matter isn't
    // searchable, no matter how many characters it has. La Fontaine's "Fables …
    // Tome Premier" is 42k characters and yielded zero body text; Manzoni's
    // "Brani inediti" is 690k and yielded a single paragraph — both are
    // prefaces and tables of contents where the actual work is in another
    // volume. Ten is the same floor MIN_CHARS aims for, expressed in paragraphs.
    if (chunks.length < MIN_BODY_CHUNKS) {
      return {
        ...base,
        chars: text.length,
        chunks: chunks.length,
        reason: `bara ${chunks.length} sökbara stycken`,
      };
    }
    return { ...base, chars: text.length, chunks: chunks.length };
  } catch (err) {
    return { ...base, reason: err instanceof Error ? err.message.slice(0, 62) : "fel" };
  }
}

/**
 * Duplicate-detection key for a title.
 *
 * The volume number must be included, and it's the same lesson the Gutenberg
 * part carries about Gibbon: "Essais de Montaigne (self-édition) - Volume I"
 * and "… Volume IV" are identical in the first forty characters, so without the
 * number exactly one of four volumes survives — chosen arbitrarily. The number
 * is extracted first and placed at the front of the key.
 */
const titleKey = (t: string) => {
  const volume =
    /\b(?:tome|volume|vol|band|partie)\s*([IVXLC]+|\d+)\b/i.exec(t)?.[1]?.toUpperCase() ?? "";
  const base = t
    .toLowerCase()
    .replace(/[^a-zàâçéèêëîïôùûüòìù0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Sixty, not forty: Boccaccio's "Il Comento alla Divina Commedia, e gli
    // altri scritti intorno a Dante, vol. 1" carries its volume number only
    // after around the fiftieth character, and at forty three volumes
    // collapsed into one.
    .slice(0, 60);
  return `${volume}|${base}`;
};

export interface LanguagePart {
  /** Gutenberg's language code: "fr", "it". */
  language: Language;
  /** Prefix on the manifest ID, so languages don't collide with each other. */
  prefix: string;
  outPath: string;
  authors: Author[];
}

export async function buildLanguagePart(part: LanguagePart): Promise<void> {
  const dry = process.argv.includes("--dry");
  const listAuthors = process.argv.includes("--authors");
  const { language, prefix, authors: AUTHORS } = part;

  const rows = await catalogue(language);
  console.log(`Katalogen: ${rows.length} texter på ${language}`);

  if (listAuthors) {
    const needle = process.argv.slice(2).find((a) => !a.startsWith("--"))?.toLowerCase();
    const counts = new Map<string, number>();
    for (const r of rows) {
      const first = r.authors.split(";")[0].trim();
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
      if (needle && !name.toLowerCase().includes(needle)) continue;
      if (!needle && n < 5) continue;
      console.log(`  ${String(n).padStart(4)}  ${name}`);
    }
    return;
  }

  const works: CanonWork[] = [];

  for (const author of AUTHORS) {
    const free = author.death + PROTECTION_YEARS;
    if (free >= new Date().getFullYear()) {
      console.error(
        `\n${author.display}\n  ✗ dog ${author.death} och är skyddad till ${free}. Hoppas över.`,
      );
      continue;
    }

    const matched = rows.filter(
      (r) => isPrimary(r.authors, author.name) && !JUNK_TITLE.test(r.title),
    );
    const filtered = rows.filter((r) => isPrimary(r.authors, author.name)).length;

    console.log(`\n${author.display} — ${matched.length} verk (${filtered} i katalogen)`);
    if (matched.length === 0) {
      console.error(
        `  ✗ "${author.name}" gav inga verk. ` +
          (filtered > 0
            ? `${filtered} fanns men föll på titelfiltret.`
            : `Kör --authors ${author.name.split(",")[0].toLowerCase()} och kontrollera namnformen.`),
      );
      continue;
    }

    const evaluated: Candidate[] = [];
    for (const row of matched) evaluated.push(await evaluate(row, author, language));

    const ok = evaluated.filter((c) => c.reason === "");
    const rejected = evaluated.filter((c) => c.reason !== "");

    const byTitle = new Map<string, Candidate>();
    for (const c of ok.sort((a, b) => b.chars - a.chars)) {
      const key = titleKey(c.title);
      if (!byTitle.has(key)) byTitle.set(key, c);
    }
    const kept = [...byTitle.values()]
      .sort((a, b) => b.chars - a.chars)
      .slice(0, MAX_WORKS_PER_AUTHOR);

    for (const c of kept) {
      console.log(
        `  ✓ ${String(c.id).padStart(6)}  ${String(Math.round(c.chars / 1000)).padStart(4)}k  ` +
          `${String(c.chunks).padStart(4)} st  ${c.title.replace(/\s+/g, " ").slice(0, 52)}`,
      );
      works.push({
        // The source ID goes last, and that's not cosmetic: the title slug is
        // truncated to forty characters, and Montaigne's four volumes, Taine's
        // five and Flaubert's eight then become the same string. Without the
        // number they'd share a manifest ID, `WORK_BY_ID` would drop all but
        // one, and ingest would process the same ID over and over — which in
        // turn produced "UNIQUE constraint failed on vec_chunks". The same
        // convention the Gutenberg part already uses for Gibbon's volumes.
        id: `${prefix}-${slug(author.display)}-${slug(c.title).slice(0, 40)}-${c.id}`,
        source: "gutenberg",
        sourceId: String(c.id),
        author: author.display,
        title: c.title.replace(/\s+/g, " ").slice(0, 180),
        genre: author.genre,
        language,
        year: author.death,
        era: eraOf(author.death),
        titleMatch: "",
        authorMatch: author.name.split(",")[0].toLowerCase(),
      });
    }

    for (const c of rejected.slice(0, 3)) {
      console.log(`      ✗ ${c.title.replace(/\s+/g, " ").slice(0, 48).padEnd(48)} ${c.reason}`);
    }
    if (rejected.length > 3) console.log(`      … och ${rejected.length - 3} till`);
    if (byTitle.size > MAX_WORKS_PER_AUTHOR) {
      console.log(`      (${byTitle.size - MAX_WORKS_PER_AUTHOR} verk över taket på ${MAX_WORKS_PER_AUTHOR})`);
    }
  }


  assertNoDuplicateIds(works);
  console.log(`\n${works.length} verk av ${new Set(works.map((w) => w.author)).size} författare`);

  writeManifest(part.outPath, works, dry);
  if (!dry) console.log("Kör `pnpm ingest --source=gutenberg` för att indexera.");
}

