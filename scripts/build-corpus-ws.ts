/**
 * Generates the Wikisource part of the manifest (`src/lib/corpus-ws.json`).
 *
 *   pnpm build-corpus-ws          regenerate
 *   pnpm build-corpus-ws --dry    show the report without writing the file
 *
 * THE LIST IS WORKS, NOT AUTHORS, unlike every other generator. The other
 * sources have a catalog to query — a CSV, an API, an index page — and can
 * therefore start from a name and ask what exists. Wikisource has none. Author
 * pages are hand-written and mix works, articles *about* the author, and
 * bibliographic notes in the same bullet list; deriving the selection from
 * that would be guessing. Every row below is instead a claim about a single
 * page, and the checks in `wikisource.ts` test the claim.
 *
 * Why this source exists at all is in the module comment of
 * `src/lib/wikisource.ts`: Joseph de Maistre isn't in any of the other seven sources.
 */
import path from "node:path";
import { chunkText } from "../src/lib/chunk";
import {
  fetchPage,
  fetchParts,
  MIN_QUALITY,
  pageUrl,
  PROTECTION_YEARS,
  type Page,
} from "../src/lib/wikisource";
import type { CanonWork, Genre, Language } from "../src/lib/corpus";
import { eraOf } from "./lib/era";
import { assertNoDuplicateIds, writeManifest } from "./lib/manifest";

const OUT_PATH = path.join(process.cwd(), "src", "lib", "corpus-ws.json");

/** The shortest a work may be and still be included. Same figure as the language parts. */
const MIN_CHARS = 12_000;

/** The fewest searchable paragraphs a work may have and still be included. See build-corpus-lang.ts. */
const MIN_BODY_CHUNKS = 10;

interface Entry {
  /** The page's title on Wikisource. If the work is split into chapters, this is its index page. */
  page: string;
  language: Language;
  author: string;
  /** Year of death. Becomes `year`, era, chronological sort order — and the rights basis. */
  death: number;
  genre: Genre;
  /** Substring from the page header's author name. Checked against the page itself. */
  authorMatch: string;
}

/**
 * The works included.
 *
 * De Maistre was the reason this source was built at all. He was missing from
 * a collection that already had Rousseau, Burke, Tocqueville and Constant —
 * that is, the Revolution and its English critique, but none of those who
 * rejected it at the root.
 *
 * LATIN AFTER ANTIQUITY IS NOW THE HEAVIEST ENTRY, and this was a gap that was
 * measured in the manifest before it was filled. Counted by era and language it
 * looked like this:
 *
 *   antiquity/la 61      medieval/la 4 (all Boethius)      renaissance/la 0
 *
 * Renaissance Latin was the single fully empty cell in the whole grid. The
 * reason is that `la` had until now been *a single source*: Perseus, which ends
 * with antiquity. The README already says as much about that archive — no
 * Augustine and no Aquinas — and the conclusion there, that Latin merely
 * duplicates what the translation already provides, held only as long as
 * Perseus was the whole of Latin.
 *
 * The point is that this DOESN'T COST A NEW BRANCH. `la` already has a vector
 * branch, chunking rules, and measured cross-encoder support (7.0/10, ρ 0.841,
 * spread 0.099 in `.probe-rerank-more.ts`, i.e. in English's territory). A new
 * language would have added ~0.3–0.7 s and a HyDE passage to every search
 * forever; this adds nothing.
 *
 * Pico della Mirandola is the case that shows exactly why this source was
 * needed: *Oratio de hominis dignitate* doesn't exist on Gutenberg in any
 * language, not in TCP (which ends at English print), not on Perseus. It lives
 * on la.wikisource as a single page of 55k characters.
 *
 * THE ITALIAN ROWS ARE ART THEORY IN THE ORIGINAL, plus the four names the
 * README's own note at `build-corpus-it.ts` says are missing from Gutenberg's
 * Italian catalog: Petrarca, Tasso, Galilei and Boccaccio's *Decameron*.
 * Vasari's *Vite* is in the collection in English translation; the 1568 text is
 * a different text, and it's the same tradeoff as TCP's Leviathan versus Gutenberg's.
 *
 * PROOFREADING QUALITY DECIDES WHAT ACTUALLY GETS IN, and it isn't known in
 * advance for any of the works below — la.wikisource and it.wikisource are less
 * well proofread than fr. The rows are claims that `--dry` tests, and a work
 * that fails stays in the list as a record of what's been tried.
 *
 * *Les Soirées de Saint-Pétersbourg* stays for exactly that reason: it
 * currently fails on proofreading quality — 25%, i.e. mostly unproofread text,
 * and 15k characters where the printed edition is eleven dialogues. If someone
 * proofreads the page, the work will get in on its own. Same practice the MIA
 * generator applies to Luxemburg and Kollontai.
 *
 * `authorMatch` is deliberately short and written in the form the page's OWN
 * header might plausibly use for the name — "cartes" catches both Cartesius and
 * Descartes, "mor" catches both More and Morus. It's the same rule as the rest
 * of the repo: expectation is drawn from the file, not from a catalog, and
 * `--dry` prints what the header actually said when it doesn't match.
 */
const ENTRIES: Entry[] = [
  {
    page: "Considérations sur la France",
    language: "fr",
    author: "Joseph de Maistre",
    death: 1821,
    genre: "politik",
    authorMatch: "maistre",
  },
  {
    page: "De l’Église gallicane dans son rapport avec le souverain pontife",
    language: "fr",
    author: "Joseph de Maistre",
    death: 1821,
    genre: "politik",
    authorMatch: "maistre",
  },
  {
    page: "Lettres à un gentilhomme russe sur l'inquisition espagnole",
    language: "fr",
    author: "Joseph de Maistre",
    death: 1821,
    genre: "politik",
    authorMatch: "maistre",
  },
  {
    page: "Les Soirées de Saint-Pétersbourg",
    language: "fr",
    author: "Joseph de Maistre",
    death: 1821,
    genre: "politik",
    authorMatch: "maistre",
  },

  /* --- Latin after antiquity: the medieval period and the Renaissance --- */

  // Renaissance humanism. None of the three exist in the collection in any language.
  {
    page: "Oratio de hominis dignitate",
    language: "la",
    author: "Giovanni Pico della Mirandola",
    death: 1494,
    genre: "filosofi",
    authorMatch: "pico",
  },
  {
    page: "De docta ignorantia",
    language: "la",
    author: "Nicolaus Cusanus",
    death: 1464,
    genre: "filosofi",
    authorMatch: "cusa",
  },
  {
    page: "De pictura",
    language: "la",
    author: "Leon Battista Alberti",
    death: 1472,
    genre: "essä",
    authorMatch: "alberti",
  },

  // The four below already exist in the collection in English translation. The
  // overlap is the point, as with TCP: a question about *civitas*, *gratia* or
  // *conatus* hits the word itself instead of the 19th-century English paraphrase of it.
  {
    page: "Confessiones",
    language: "la",
    author: "Augustinus",
    death: 430,
    genre: "filosofi",
    authorMatch: "augustin",
  },
  {
    page: "De civitate Dei",
    language: "la",
    author: "Augustinus",
    death: 430,
    genre: "filosofi",
    authorMatch: "augustin",
  },
  {
    page: "Summa Theologiae",
    language: "la",
    author: "Thomas av Aquino",
    death: 1274,
    genre: "filosofi",
    authorMatch: "thomas",
  },
  {
    page: "Moriae encomium",
    language: "la",
    author: "Erasmus av Rotterdam",
    death: 1536,
    genre: "filosofi",
    authorMatch: "erasmus",
  },
  {
    page: "Utopia",
    language: "la",
    author: "Thomas More",
    death: 1535,
    genre: "filosofi",
    authorMatch: "mor",
  },

  // Early modern philosophy and science was written in Latin, and the
  // collection has these authors exclusively in translation. Spinoza's *Ethica*
  // is the case where it matters most: the geometry of the exposition is in
  // the wording, not just the content.
  {
    page: "Ethica",
    language: "la",
    author: "Benedictus de Spinoza",
    death: 1677,
    genre: "filosofi",
    authorMatch: "spinoza",
  },
  {
    page: "Novum Organum",
    language: "la",
    author: "Francis Bacon",
    death: 1626,
    genre: "filosofi",
    authorMatch: "bacon",
  },
  {
    page: "Meditationes de prima philosophia",
    language: "la",
    author: "René Descartes",
    death: 1650,
    genre: "filosofi",
    authorMatch: "cartes",
  },
  {
    page: "Philosophiae Naturalis Principia Mathematica",
    language: "la",
    author: "Isaac Newton",
    death: 1727,
    genre: "vetenskap",
    authorMatch: "newton",
  },
  // Vitruvius is in the collection as Perseus's English translation, and it
  // carries a citation on every passage. The original is included anyway: the
  // vocabulary of architecture — *firmitas*, *utilitas*, *venustas* — is what
  // Alberti and Palladio write in relation to, and those words don't appear in
  // the English wording.
  {
    page: "De architectura",
    language: "la",
    author: "Vitruvius",
    death: -15,
    genre: "vetenskap",
    authorMatch: "vitruv",
  },

  /* --- Italian: art theory in the original, plus the catalog's gaps --- */

  {
    page: "Le vite de' più eccellenti pittori, scultori e architettori (1568)",
    language: "it",
    author: "Giorgio Vasari",
    death: 1574,
    genre: "historia",
    authorMatch: "vasari",
  },
  {
    page: "Il libro dell'arte",
    language: "it",
    author: "Cennino Cennini",
    death: 1440,
    genre: "essä",
    authorMatch: "cennini",
  },
  // The four below are the names `build-corpus-it.ts` itself says are missing
  // from Gutenberg. The catalog has them only in English translation.
  {
    page: "Canzoniere (Rerum vulgarium fragmenta)",
    language: "it",
    author: "Francesco Petrarca",
    death: 1374,
    genre: "dikt",
    authorMatch: "petrarca",
  },
  {
    page: "Decameron",
    language: "it",
    author: "Giovanni Boccaccio",
    death: 1375,
    genre: "prosa",
    authorMatch: "boccaccio",
  },
  {
    page: "Gerusalemme liberata",
    language: "it",
    author: "Torquato Tasso",
    death: 1595,
    genre: "dikt",
    authorMatch: "tasso",
  },
  {
    page: "Il Saggiatore",
    language: "it",
    author: "Galileo Galilei",
    death: 1642,
    genre: "vetenskap",
    authorMatch: "galilei",
  },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[åäàáâãæ]/g, "a")
    .replace(/[öòóôõø]/g, "o")
    .replace(/[éèêë]/g, "e")
    .replace(/[üùúû]/g, "u")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

interface Assessed {
  parts: string[];
  chars: number;
  chunks: number;
  /** Parts that cleared the proofreading floor, lacked a rating, or failed, respectively. */
  rated: number;
  unrated: number;
  rejected: string[];
  reason: string;
}

/**
 * Assesses a work: fetches every part, checks it, and counts.
 *
 * The checks are deliberately duplicated — they run here *and* in
 * `wikisource.ts` on every indexing run. That's the same ordering as the rest
 * of the repo: the generator should reject a work in the report, where someone
 * reads it, and indexing should reject it again in case the manifest was hand-edited afterward.
 */
async function assess(entry: Entry): Promise<Assessed> {
  const base: Assessed = {
    parts: [],
    chars: 0,
    chunks: 0,
    rated: 0,
    unrated: 0,
    rejected: [],
    reason: "",
  };

  const free = entry.death + PROTECTION_YEARS;
  if (free >= new Date().getFullYear()) {
    return { ...base, reason: `skyddad till ${free}` };
  }

  const subpages = await fetchParts(entry.language, entry.page);
  // A work that lives on a single page has that page as its only part. This
  // isn't an exception but the normal shape for shorter writings.
  const parts = subpages.length > 0 ? subpages : [entry.page];

  // Only parts that passed the checks are written into the manifest. A
  // rejected part left in the list would fail the whole work at indexing time,
  // where the same check reruns — and a work that gets rebuilt every night
  // because one of forty pages is unproofread isn't a work, it's an alarm.
  const accepted: string[] = [];
  const texts: string[] = [];
  for (const part of parts) {
    let page: Page;
    try {
      page = await fetchPage(entry.language, part);
    } catch (err) {
      base.rejected.push(
        `${part}: ${err instanceof Error ? err.message : "fel"}`,
      );
      continue;
    }

    if (!page.author.toLowerCase().includes(entry.authorMatch)) {
      base.rejected.push(`${part}: huvudet anger "${page.author}"`);
      continue;
    }
    if (page.translator) {
      base.rejected.push(`${part}: översatt av ${page.translator}`);
      continue;
    }
    if (page.quality !== null && page.quality < MIN_QUALITY) {
      base.rejected.push(`${part}: ${page.quality} % korrektur`);
      continue;
    }
    if (page.quality === null) base.unrated++;
    else base.rated++;

    accepted.push(part);
    texts.push(page.text);
  }

  const text = texts.join("\n\n");
  const chunks = chunkText(text, entry.language).filter(
    (c) => !c.isFrontMatter,
  );
  const assessed = {
    ...base,
    parts: accepted,
    chars: text.length,
    chunks: chunks.length,
  };

  if (texts.length === 0) return { ...assessed, reason: "ingen del godkändes" };
  if (text.length < MIN_CHARS) return { ...assessed, reason: "för kort" };
  if (chunks.length < MIN_BODY_CHUNKS) {
    return { ...assessed, reason: `bara ${chunks.length} sökbara stycken` };
  }
  return assessed;
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const works: CanonWork[] = [];

  for (const entry of ENTRIES) {
    console.log(`\n${entry.author} — ${entry.page}`);
    const a = await assess(entry);

    const counted =
      `${a.parts.length} delar · ${Math.round(a.chars / 1000)}k tecken · ` +
      `${a.chunks} stycken · ${a.rated} korrekturlästa, ${a.unrated} obedömda`;

    if (a.reason) {
      console.error(`  ✗ ${a.reason}  (${counted})`);
    } else {
      console.log(`  ✓ ${counted}`);
      works.push({
        id: `ws-${slug(entry.author)}-${slug(entry.page).slice(0, 40)}`,
        source: "wikisource",
        sourceId: entry.page,
        // The URL is written into the manifest: the hostname is language-specific,
        // and `sourceLink` doesn't see the language field. The reason is stated there.
        sourceUrl: pageUrl(entry.language, entry.page),
        author: entry.author,
        title: entry.page,
        genre: entry.genre,
        language: entry.language,
        year: entry.death,
        era: eraOf(entry.death),
        titleMatch: entry.page,
        authorMatch: entry.authorMatch,
        parts: a.parts,
      });
    }

    // Every rejected part is printed with its reason. The report must be
    // auditable, not merely trusted — the same requirement the MIA generator
    // places on its own.
    for (const r of a.rejected.slice(0, 5)) console.log(`      ✗ ${r}`);
    if (a.rejected.length > 5)
      console.log(`      … och ${a.rejected.length - 5} till`);
  }

  assertNoDuplicateIds(works);

  console.log(
    `\n${works.length} verk av ${new Set(works.map((w) => w.author)).size} författare`,
  );

  writeManifest(OUT_PATH, works, dry);
  if (!dry) console.log("Kör `pnpm ingest --source=wikisource` för att indexera.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
