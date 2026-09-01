/**
 * Generates the DTA part of the manifest (`src/lib/corpus-dta.json`).
 *
 *   pnpm build-corpus-dta            regenerate
 *   pnpm build-corpus-dta --dry      show the report without writing the file
 *   pnpm build-corpus-dta --authors [search term]   list the catalog's name forms
 *
 * DTA has no downloadable catalog file like Gutenberg and TCP. The catalog
 * is `/list`, fifty-five pages of a hundred entries each, where each entry
 * is a link with the text "Surname, Forename: Title …". The generator
 * walks through them once and caches the pages, so a rerun costs nothing.
 *
 * THE COLLECTION'S FIRST GERMAN-LANGUAGE PART. That it works is measured,
 * not assumed — see the module comment in `src/lib/dta.ts` and
 * `.probe-rerank-lang.ts`. In short: the cross-encoder holds Swedish and
 * German together just as well as Swedish and English, while French sits
 * noticeably lower and was therefore not admitted.
 *
 * WHY THE ORIGINAL AND NOT THE TRANSLATION. The same reason Runeberg
 * exists. The README follows Hegel's § 548 all the way through and shows
 * that the passage never lands because Wallace writes "mind" where Hegel
 * wrote *Geist*, and that the word "progress" doesn't appear in the
 * English wording at all. The original isn't a second edition of the same
 * text — it's the text the question actually concerns.
 */
import fs from "node:fs";
import path from "node:path";
import { CORPUS } from "../src/lib/corpus";
import { CACHE_DIR } from "../src/lib/db";
import { chunkText } from "../src/lib/chunk";
import {
  FREE_LICENCE,
  fetchRaw,
  parseHeader,
  readerUrl,
  toText,
} from "../src/lib/dta";
import { decodeEntities } from "../src/lib/html";
import type { CanonWork, Genre } from "../src/lib/corpus";
import { eraOf } from "./lib/era";
import { assertNoDuplicateIds, writeManifest } from "./lib/manifest";

const OUT_PATH = path.join(process.cwd(), "src", "lib", "corpus-dta.json");
const BASE = "https://www.deutschestextarchiv.de";

/** Catalog pages. Fifty-five of a hundred entries each at time of writing; the cap is generous. */
const LIST_PAGES = 60;

/** How many works at most per author. A cap, not a target. */
const MAX_WORKS_PER_AUTHOR = 10;

/**
 * How short a text may be and still become a work.
 *
 * Same figure as the Perseus part. DTA has plenty of single speeches and
 * journal articles that are five pages, and a manifest entry for each
 * would make no collection, only a list.
 */
const MIN_CHARS = 12_000;

interface Author {
  /** The catalog's form: "Surname, Forename". Matched on an exact string. */
  name: string;
  display: string;
  genre: Genre;
  /** Death year. Becomes `year`, era, and chronological sort. */
  death: number;
}

/**
 * The authors included.
 *
 * The focus is German idealism and its heirs, since that's where the
 * collection's English translations fail worst. Hegel is the stated
 * reason — see the file header — but the same holds for Kant's *Critik*,
 * where Meiklejohn's 19th-century English smooths over exactly the terms
 * a question usually turns on.
 *
 * The catalog corrected four lines I first wrote from memory, which is why
 * `--authors` exists:
 *
 *   Arthur Schopenhauer   doesn't exist in DTA. The catalog's
 *                         "Schopenhauer" is Johanna, his mother and a novelist.
 *   Herder                is listed as "Herder, Johann Gottfried von", with "von".
 *   Engels                has no entry of his own, only "Marx, Karl; Engels, Friedrich".
 *   Lichtenberg           is filed under the pseudonym "Photorin, Conrad", one work.
 *
 * Alexander von Humboldt was added for the opposite reason: he has 181
 * entries in the catalog and was missing from the collection, and nature
 * writing is a genre the science category hadn't had at all until now.
 */
const AUTHORS: Author[] = [
  {
    name: "Kant, Immanuel",
    display: "Immanuel Kant",
    genre: "filosofi",
    death: 1804,
  },
  {
    name: "Hegel, Georg Wilhelm Friedrich",
    display: "G. W. F. Hegel",
    genre: "filosofi",
    death: 1831,
  },
  {
    name: "Nietzsche, Friedrich",
    display: "Friedrich Nietzsche",
    genre: "filosofi",
    death: 1900,
  },
  {
    name: "Fichte, Johann Gottlieb",
    display: "J. G. Fichte",
    genre: "filosofi",
    death: 1814,
  },
  {
    name: "Schelling, Friedrich Wilhelm Joseph von",
    display: "F. W. J. Schelling",
    genre: "filosofi",
    death: 1854,
  },
  {
    name: "Feuerbach, Ludwig",
    display: "Ludwig Feuerbach",
    genre: "filosofi",
    death: 1872,
  },
  // The path up to Kant and the path away from Hegel. The collection
  // jumped from Leibniz straight to Kant in German: the Enlightenment's
  // own self-examination — Mendelssohn's answer to "was heißt
  // aufklären?" and Hamann's attack on that very Enlightenment — was
  // missing, and so was Jacobi, who started the pantheism controversy
  // Schelling and Hegel responded to. Schleiermacher and Dilthey are the
  // other end: hermeneutics as method, and the only basis the collection
  // has for questions about interpretation and understanding.
  //
  // The catalog is thin for several of them — Schleiermacher has a
  // single text, Dilthey two, Jacobi one. They're still the right lines:
  // one text of `Einleitung in die Geisteswissenschaften` is more than
  // zero texts on Verstehen.
  {
    name: "Mendelssohn, Moses",
    display: "Moses Mendelssohn",
    genre: "filosofi",
    death: 1786,
  },
  {
    name: "Hamann, Johann Georg",
    display: "Johann Georg Hamann",
    genre: "filosofi",
    death: 1788,
  },
  // "Jacobi, Johann Friedrich" and "Jacobi, Maximilian" are different
  // people in the same catalog. An exact string tells them apart; a
  // substring match wouldn't.
  {
    name: "Jacobi, Friedrich Heinrich",
    display: "F. H. Jacobi",
    genre: "filosofi",
    death: 1819,
  },
  {
    name: "Schleiermacher, Friedrich",
    display: "Friedrich Schleiermacher",
    genre: "filosofi",
    death: 1834,
  },
  {
    name: "Dilthey, Wilhelm",
    display: "Wilhelm Dilthey",
    genre: "filosofi",
    death: 1911,
  },
  // Stirner existed only as Byington's `The Ego and His Own`, and that's
  // an unfortunate text to have alone: "Der Einzige" isn't "the ego", and
  // the whole book stands or falls on what the word means. Same reason
  // the README makes about Hegel's *Geist* versus Wallace's "mind" — the
  // original isn't a second edition but the text the question concerns.
  // The display name is the same one the Gutenberg row carries, so the
  // two editions land under one author in the interface.
  {
    name: "Stirner, Max",
    display: "Max Stirner",
    genre: "filosofi",
    death: 1856,
  },
  // PHILOSOPHY AND NOT ANTHROPOLOGY, and that's a choice against the
  // company he'd otherwise keep. Durkheim, Le Bon, Westermarck, and
  // Hobhouse — Simmel's contemporaries — are all listed under
  // anthropology, but in this collection that genre belongs to
  // ethnography: Frazer, Tylor, Boas. `Philosophie des Geldes` is his
  // heaviest text in DTA and concerns value, exchange, and the form of
  // modern life. That question is asked under philosophy, and no one
  // would look for it among Frazer's rituals. The price is that `Über
  // sociale Differenzierung` gets the same label, since the label is set per author.
  {
    name: "Simmel, Georg",
    display: "Georg Simmel",
    genre: "filosofi",
    death: 1918,
  },
  {
    name: "Herder, Johann Gottfried von",
    display: "Johann Gottfried Herder",
    genre: "antropologi",
    death: 1803,
  },
  { name: "Marx, Karl", display: "Karl Marx", genre: "politik", death: 1883 },
  {
    name: "Humboldt, Wilhelm von",
    display: "Wilhelm von Humboldt",
    genre: "politik",
    death: 1835,
  },
  {
    name: "Humboldt, Alexander von",
    display: "Alexander von Humboldt",
    genre: "vetenskap",
    death: 1859,
  },
  {
    name: "Lessing, Gotthold Ephraim",
    display: "G. E. Lessing",
    genre: "essä",
    death: 1781,
  },
  {
    name: "Schiller, Friedrich",
    display: "Friedrich Schiller",
    genre: "drama",
    death: 1805,
  },
  {
    name: "Goethe, Johann Wolfgang von",
    display: "J. W. von Goethe",
    genre: "dikt",
    death: 1832,
  },
  {
    name: "Kleist, Heinrich von",
    display: "Heinrich von Kleist",
    genre: "prosa",
    death: 1811,
  },
  {
    name: "Hölderlin, Friedrich",
    display: "Friedrich Hölderlin",
    genre: "dikt",
    death: 1843,
  },
  {
    name: "Winckelmann, Johann Joachim",
    display: "J. J. Winckelmann",
    genre: "essä",
    death: 1768,
  },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[åäàáâãæ]/g, "a")
    .replace(/[öòóôõø]/g, "o")
    .replace(/[éèêë]/g, "e")
    .replace(/[üùúû]/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

interface Entry {
  /** DTA's document id, from the link. */
  id: string;
  author: string;
  title: string;
}

/** Fetches a catalog page, with disk cache. */
async function listPage(page: number): Promise<string> {
  const dir = path.join(CACHE_DIR, "dta-catalogue");
  fs.mkdirSync(dir, { recursive: true });
  const cached = path.join(dir, `list-${page}.html`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");

  // The catalog is sixty pages in a row, and DTA's server gets tired: a
  // run hit a connection timeout at page 31. Three attempts with growing
  // backoff, and a base delay twice as long as against a single text —
  // this is the only place we ask for many pages back to back.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((r) =>
      setTimeout(r, attempt === 0 ? 2000 : 8000 * attempt),
    );
    try {
      const res = await fetch(`${BASE}/list?p=${page}`, {
        headers: {
          "User-Agent": "canon-indexer/0.1 (personal research project)",
          Cookie: "verified=1",
        },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`sida ${page} svarade ${res.status}`);
      const body = await res.text();
      fs.writeFileSync(cached, body, "utf8");
      return body;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `DTA-katalogen sida ${page}: ${lastError instanceof Error ? lastError.message : "okänt fel"}`,
  );
}

/**
 * The catalog entries on one page.
 *
 * Each entry is a link whose text is "Surname, Forename: Title. Place,
 * Year." — and the colon is the only thing separating author from title.
 * Titles sometimes contain a colon themselves, so only the FIRST one
 * splits the entry.
 *
 * THE BRACKETS HAVE TO GO FIRST. DTA puts the author in square brackets
 * when the work was printed anonymously — "[Hamann, Johann Georg]:
 * Sokratische Denkwürdigkeiten" — and since matching against AUTHORS is
 * on an exact string, those entries silently fell outside it. 148 of the
 * catalog's entries look like this, and for Hamann it's his entire output
 * in the archive: without this, his line gave zero matches. Herder gains
 * `Auch eine Philosophie der Geschichte` from the same fix.
 */
function parseList(html: string): Entry[] {
  const out: Entry[] = [];
  for (const m of html.matchAll(
    /<a href="[^"]*\/book\/show\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const id = m[1];
    const label = decodeEntities(m[2].replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    const colon = label.indexOf(":");
    if (colon === -1) continue;
    out.push({
      id,
      author: label
        .slice(0, colon)
        .trim()
        .replace(/^\[(.*)\]$/, "$1"),
      title: label.slice(colon + 1).trim(),
    });
  }
  return out;
}

interface Candidate {
  id: string;
  title: string;
  author: string | null;
  year: number | null;
  cc: boolean;
  chars: number;
  chunks: number;
  reason: string;
}

async function evaluate(entry: Entry): Promise<Candidate> {
  const work = {
    id: entry.id,
    sourceId: entry.id,
    titleMatch: "",
    authorMatch: "",
  } as CanonWork;
  const base: Candidate = {
    id: entry.id,
    title: entry.title,
    author: null,
    year: null,
    cc: false,
    chars: 0,
    chunks: 0,
    reason: "",
  };
  try {
    const raw = await fetchRaw(work);
    const head = parseHeader(raw);
    const cc = FREE_LICENCE.test(head.licence ?? "");
    if (!cc)
      return {
        ...base,
        reason: `licens: ${(head.licence ?? "saknas").slice(0, 40)}`,
      };

    const text = toText(raw, work);
    const chunks = chunkText(text, "de").filter((c) => !c.isFrontMatter);
    const candidate: Candidate = {
      ...base,
      title: head.title ?? entry.title,
      author: head.author,
      year: head.year,
      cc,
      chars: text.length,
      chunks: chunks.length,
    };
    if (text.length < MIN_CHARS) return { ...candidate, reason: "för kort" };
    return candidate;
  } catch (err) {
    return {
      ...base,
      reason: err instanceof Error ? err.message.slice(0, 60) : "fel",
    };
  }
}

const titleKey = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-zäöüß0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

async function main() {
  const dry = process.argv.includes("--dry");
  const listAuthors = process.argv.includes("--authors");

  const entries: Entry[] = [];
  for (let p = 1; p <= LIST_PAGES; p++) {
    const page = await listPage(p);
    const rows = parseList(page);
    if (rows.length === 0) break;
    entries.push(...rows);
    process.stdout.write(`\r  katalog: ${entries.length} poster`);
  }
  process.stdout.write("\r\x1b[K");
  console.log(`Katalogen: ${entries.length} texter`);

  if (listAuthors) {
    // slice(2): argv[0] is the node path and argv[1] the script, and neither starts with "--".
    const needle = process.argv
      .slice(2)
      .find((a) => !a.startsWith("--"))
      ?.toLowerCase();
    const counts = new Map<string, number>();
    for (const e of entries)
      counts.set(e.author, (counts.get(e.author) ?? 0) + 1);
    for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
      if (needle && !name.toLowerCase().includes(needle)) continue;
      if (!needle && n < 4) continue;
      console.log(`  ${String(n).padStart(4)}  ${name}`);
    }
    return;
  }

  const existing = new Set(
    CORPUS.filter((w) => w.source !== "dta").map((w) => w.author.toLowerCase()),
  );
  const works: CanonWork[] = [];
  const overlap: string[] = [];

  for (const author of AUTHORS) {
    // Exact string, never substring — the same lesson the Gutenberg part carries.
    const matched = entries.filter((e) => e.author === author.name);
    console.log(`\n${author.display} — ${matched.length} texter i katalogen`);
    if (matched.length === 0) {
      console.error(
        `  ✗ "${author.name}" finns inte som exakt författarform. ` +
          `Kör --authors ${author.name.split(",")[0].toLowerCase()} och kontrollera.`,
      );
      continue;
    }
    if (existing.has(author.display.toLowerCase()))
      overlap.push(author.display);

    const evaluated: Candidate[] = [];
    for (const e of matched) evaluated.push(await evaluate(e));

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
        `  ✓ ${String(c.year ?? "?").padStart(4)}  ${String(Math.round(c.chars / 1000)).padStart(4)}k  ` +
          `${String(c.chunks).padStart(4)} st  ${c.title.slice(0, 52)}`,
      );
      works.push({
        id: `dta-${slug(author.display)}-${slug(c.title).slice(0, 40)}`,
        source: "dta",
        sourceId: c.id,
        sourceUrl: readerUrl(c.id),
        author: author.display,
        title: c.title.slice(0, 180),
        genre: author.genre,
        language: "de",
        year: author.death,
        era: eraOf(author.death),
        titleMatch: "",
        // The file's own author field, not the catalog's. The Perseus
        // part showed what it costs when they diverge.
        authorMatch: (c.author ?? "").toLowerCase().slice(0, 60),
      });
    }

    for (const c of rejected.slice(0, 3)) {
      console.log(`      ✗ ${c.title.slice(0, 48).padEnd(48)} ${c.reason}`);
    }
    if (rejected.length > 3)
      console.log(`      … och ${rejected.length - 3} till`);
    if (byTitle.size > MAX_WORKS_PER_AUTHOR) {
      console.log(
        `      (${byTitle.size - MAX_WORKS_PER_AUTHOR} verk över taket på ${MAX_WORKS_PER_AUTHOR})`,
      );
    }
  }

  assertNoDuplicateIds(works);
  console.log(
    `\n${works.length} verk av ${new Set(works.map((w) => w.author)).size} författare`,
  );
  if (overlap.length > 0) {
    console.log(
      `\n${overlap.length} författare finns redan i samlingen i engelsk översättning och ` +
        `får nu sitt original vid sidan av den: ${overlap.join(", ")}`,
    );
  }

  writeManifest(OUT_PATH, works, dry);
  console.log("Kör `pnpm ingest --source=dta` för att indexera.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
