/**
 * Generates the TCP part of the manifest (`src/lib/corpus-tcp.json`).
 *
 *   pnpm build-corpus-tcp           regenerate
 *   pnpm build-corpus-tcp --dry     show the report without writing the file
 *   pnpm build-corpus-tcp --authors list the catalog's name forms for a selection
 *
 * The catalog is a single 29 MB CSV — `textcreationpartnership/Texts/TCP.csv`
 * — with 61,315 rows. Each row is a text, and each text lives in its own
 * GitHub repo. The generator reads the catalog, picks the rows belonging
 * to the authors below, fetches each text, and evaluates it.
 *
 * THE OVERLAP IS OFTEN THE POINT HERE, unlike at Perseus. Gutenberg has
 * Leviathan, but in a 19th-century edition with normalized spelling; TCP
 * has it as it was printed in 1651. Those are two different texts, and a
 * question about sovereignty can be better answered by one than the
 * other. The report lists the overlap anyway, because it should be a
 * choice and not an accident.
 *
 * ONE GENRE PER AUTHOR, and it follows the label the author already has
 * in the collection. Milton's political pamphlets therefore land under
 * "poetry & epic" because Gutenberg's Milton is the poet. That's the same
 * price the README describes for Seneca's tragedies under "philosophy" —
 * one label per author, and the genre carries through to reranking.
 */
import fs from "node:fs";
import path from "node:path";
import { CORPUS } from "../src/lib/corpus";
import { CACHE_DIR } from "../src/lib/db";
import { chunkText } from "../src/lib/chunk";
import {
  fetchRaw,
  MAX_LOST_WORDS_PER_1000,
  parseHeader,
  toTcpText,
} from "../src/lib/tcp";
import type { CanonWork, Genre } from "../src/lib/corpus";
import { eraOf } from "./lib/era";
import { assertNoDuplicateIds, writeManifest } from "./lib/manifest";
import { parseCsv } from "./lib/csv";

const OUT_PATH = path.join(process.cwd(), "src", "lib", "corpus-tcp.json");

const CATALOGUE =
  "https://raw.githubusercontent.com/textcreationpartnership/Texts/master/TCP.csv";

/** How many works at most per author. A cap, not a target. */
const MAX_WORKS_PER_AUTHOR = 12;

/**
 * Works that survive the cap regardless of length.
 *
 * Selection is ranked by character count, and length isn't importance —
 * the same lesson `PRIORITY_IDS` in the Gutenberg part carries about
 * Shakespeare and the folio's ordering. It first showed up when matching
 * was widened to the first component: Milton's candidate list grew from
 * 30 to 37 rows, `LXXX sermons` at 3.9 MB and `History of Britain` moved
 * to the top, and *Areopagitica* at 102k fell out of the twelve. A search
 * about freedom of the press would then have had nothing to answer with.
 *
 * The list is deliberately short: only works that lose on size and that
 * no other text in the collection replaces.
 */
/**
 * Rows that aren't works by the author they're listed under.
 *
 * All six came in with the widened matching: they carry a co-editor after
 * a semicolon and previously fell out by chance, not for a reason. They're
 * collected editions, digests, and one plain misattribution — and since
 * selection is ranked by length they sorted to the top and ate the cap.
 * Boyle lost four of his own writings to a digest made by someone else.
 *
 * The Gutenberg part has the same two safeguards for the same reason:
 * `DENY_IDS` for the row that points to the wrong author, `JUNK_TITLE` for
 * the collected volume that duplicates its own parts. Here a list is
 * enough, since it's six rows and not a pattern.
 */
const DENY_IDS = new Set([
  "A28936", // "The works of ... Robert Boyle, epitomiz'd by Richard Boulton" — Boulton's digest
  "A45618", // "The Oceana of James Harrington and his other works" — duplicates A45613 and four more
  "A28378", // Bacon, "Resuscitatio" — a collected volume of already-indexed pieces
  "A28024", // Bacon, "Baconiana, or, Certain genuine remains" — posthumous remains, compiled
  "A58844", // "Scrinia Ceciliana" — Burghley's letters, not Bacon's text
  "A33819", // Cavendish, "A Collection of letters and poems ... by several persons of honour" — addressed to her, not by her
]);

const PRIORITY_IDS = new Set([
  "A50883", // Milton, Areopagitica — 42 pages against the collected volumes' hundreds
  "A70591", // Milton, The doctrine and discipline of divorce
  "A50916", // Milton, Of reformation touching church-discipline
  "A28291", // Bacon, New Atlantis — the utopia, and the collection's third after More and Campanella
  "A43995", // Hobbes, Humane nature — Elements of Law part 1; part 2 (De corpore politico) is already covered
]);

/**
 * How short a text may be and still become a work.
 *
 * Lower than Perseus's 12,000, and for a reason: 17th-century political
 * struggle was fought in pamphlets. Winstanley's *True Levellers
 * Standard* is eight pages and still the only place where the Diggers'
 * argument stands in its original form. Below ten thousand characters,
 * though, it becomes fewer than ten passages, and a work that's eight
 * passages isn't a book but a flyer.
 */
const MIN_CHARS = 10_000;

interface Author {
  /** The catalog's `Author` field, VERBATIM and with the year. See the file header. */
  name: string;
  display: string;
  genre: Genre;
  /** Death year. Becomes `year`, era, and chronological sort. */
  death: number;
}

/**
 * The authors included.
 *
 * The years in the name form aren't decoration. The catalog has both
 * "Harrington, James, 1611-1677." (Oceana) and "Harrington, James,
 * 1664-1693.", and both "Browne, Thomas, Sir, 1605-1682." (Religio
 * Medici) and "Browne, Thomas, 1654?-1741.". Matching happens on an
 * exact string, never a substring — the same lesson the Gutenberg part
 * carries about Wollstonecraft and Darwin.
 */
const AUTHORS: Author[] = [
  // The republicans and their opponents. This entire dispute was missing
  // from the collection: Harrington, Filmer, Winstanley, and Sidney don't
  // exist at Gutenberg at all, and without them 17th-century political
  // theory is just Hobbes and Locke — i.e. the conclusions without the
  // fight they came out of.
  {
    name: "Harrington, James, 1611-1677.",
    display: "James Harrington",
    genre: "politik",
    death: 1677,
  },
  {
    name: "Filmer, Robert, Sir, d. 1653.",
    display: "Robert Filmer",
    genre: "politik",
    death: 1653,
  },
  {
    name: "Winstanley, Gerrard, b. 1609.",
    display: "Gerrard Winstanley",
    genre: "politik",
    death: 1676,
  },
  {
    name: "Sidney, Algernon, 1622-1683.",
    display: "Algernon Sidney",
    genre: "politik",
    death: 1683,
  },

  // The Cambridge Platonists and their learned prose — also new to the collection.
  {
    name: "Cudworth, Ralph, 1617-1688.",
    display: "Ralph Cudworth",
    genre: "filosofi",
    death: 1688,
  },
  // Cudworth stood alone, and a school isn't one man. More is the one who
  // carried the fight against Hobbes's materialism into print, Culverwel
  // the one who spelled out the light of reason as doctrine, Smith and
  // Whichcote the ones who preached it. All four exist only here: none of
  // them has a single text at Gutenberg.
  {
    name: "More, Henry, 1614-1687.",
    display: "Henry More",
    genre: "filosofi",
    death: 1687,
  },
  {
    name: "Culverwel, Nathanael, d. 1651?",
    display: "Nathanael Culverwel",
    genre: "filosofi",
    death: 1651,
  },
  {
    name: "Smith, John, 1618-1652.",
    display: "John Smith",
    genre: "filosofi",
    death: 1652,
  },
  {
    name: "Whichcote, Benjamin, 1609-1683.",
    display: "Benjamin Whichcote",
    genre: "filosofi",
    death: 1683,
  },

  // 17th-century women philosophers. The collection had two women in
  // philosophy and politics — Wollstonecraft and Harriet Taylor Mill —
  // and both from the 1790s or later. These three wrote a hundred years
  // earlier and all three are in TCP: Conway is the only source for her
  // monadology, Cavendish wrote physics and utopia in her own right, and
  // Astell's `Serious Proposal` is the first English program for women's
  // education. None of them can be reached via Gutenberg with more than
  // one or two titles.
  {
    name: "Conway, Anne, 1631-1679.",
    display: "Anne Conway",
    genre: "filosofi",
    death: 1679,
  },
  // The catalog form is the title, not the name: "Cavendish, Margaret" gets zero matches.
  {
    name: "Newcastle, Margaret Cavendish, Duchess of, 1624?-1674.",
    display: "Margaret Cavendish",
    genre: "filosofi",
    death: 1674,
  },
  {
    name: "Astell, Mary, 1668-1731.",
    display: "Mary Astell",
    genre: "filosofi",
    death: 1731,
  },

  // The only free Malebranche in the catalog — Taylor's 1700 translation.
  // The other five rows under his name are `Restricted` and fail the
  // status check, so the report will show one text out of six. That's
  // the correct outcome, not a bug.
  {
    name: "Malebranche, Nicolas, 1638-1715.",
    display: "Nicolas Malebranche",
    genre: "filosofi",
    death: 1715,
  },
  {
    name: "Browne, Thomas, Sir, 1605-1682.",
    display: "Thomas Browne",
    genre: "essä",
    death: 1682,
  },
  {
    name: "Burton, Robert, 1577-1640.",
    display: "Robert Burton",
    genre: "essä",
    death: 1640,
  },
  {
    name: "Boyle, Robert, 1627-1691.",
    display: "Robert Boyle",
    genre: "vetenskap",
    death: 1691,
  },
  {
    name: "Donne, John, 1572-1631.",
    display: "John Donne",
    genre: "dikt",
    death: 1631,
  },
  {
    name: "Marvell, Andrew, 1621-1678.",
    display: "Andrew Marvell",
    genre: "dikt",
    death: 1678,
  },
  {
    name: "Traherne, Thomas, d. 1674.",
    display: "Thomas Traherne",
    genre: "dikt",
    death: 1674,
  },

  // Already in the collection via Gutenberg, but in later editions. Here
  // the first edition is the point, so the genre is the same one the
  // author already has.
  {
    name: "Hobbes, Thomas, 1588-1679.",
    display: "Thomas Hobbes",
    genre: "filosofi",
    death: 1679,
  },
  {
    name: "Milton, John, 1608-1674.",
    display: "John Milton",
    genre: "dikt",
    death: 1674,
  },
  {
    name: "Bacon, Francis, 1561-1626.",
    display: "Francis Bacon",
    genre: "filosofi",
    death: 1626,
  },
  {
    name: "Locke, John, 1632-1704.",
    display: "John Locke",
    genre: "filosofi",
    death: 1704,
  },
  {
    name: "More, Thomas, Sir, Saint, 1478-1535.",
    display: "Thomas More",
    genre: "filosofi",
    death: 1535,
  },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[åäàáâã]/g, "a")
    .replace(/[öòóôõø]/g, "o")
    .replace(/[éèêë]/g, "e")
    .replace(/[üùúû]/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

interface Row {
  TCP: string;
  Author: string;
  Date: string;
  Title: string;
  Status: string;
  Pages: string;
}

/** The catalog, with disk cache — 29 MB shouldn't be fetched twice. */
async function catalogue(): Promise<Row[]> {
  const dir = path.join(CACHE_DIR, "tcp-catalogue");
  fs.mkdirSync(dir, { recursive: true });
  const cached = path.join(dir, "TCP.csv");
  if (!fs.existsSync(cached)) {
    const res = await fetch(CATALOGUE, {
      headers: {
        "User-Agent": "canon-indexer/0.1 (personal research project)",
      },
    });
    if (!res.ok) throw new Error(`TCP-katalogen svarade ${res.status}`);
    fs.writeFileSync(cached, await res.text(), "utf8");
  }
  return parseTcpCatalog(fs.readFileSync(cached, "utf8"));
}

/**
 * The raw split (see `parseCsv` in `./lib/csv`) plus the header mapping
 * TCP's own columns need — this part isn't shared, since the column names
 * are specific to this one catalog.
 */
function parseTcpCatalog(text: string): Row[] {
  const rows = parseCsv(text);
  const header = rows.shift() ?? [];
  const index = (name: string) => header.indexOf(name);
  const [tcp, author, date, title, status, pages] = [
    "TCP",
    "Author",
    "Date",
    "Title",
    "Status",
    "Pages",
  ].map(index);

  return rows
    .filter((r) => r.length > 1)
    .map((r) => ({
      TCP: r[tcp] ?? "",
      Author: r[author] ?? "",
      Date: r[date] ?? "",
      Title: r[title] ?? "",
      Status: r[status] ?? "",
      Pages: r[pages] ?? "",
    }));
}

interface Candidate {
  id: string;
  title: string;
  /** The author as the file itself credits it — see `authorMatch` in the manifest entry. */
  author: string | null;
  year: number | null;
  cc0: boolean;
  lostPer1000: number;
  gapsPer1000: number;
  chars: number;
  chunks: number;
  reason: string;
}

const CC0 =
  /creativecommons\.org\/publicdomain\/zero|creative commons 0 1\.0|cc0 1\.0/i;

async function evaluate(row: Row): Promise<Candidate> {
  const work = {
    id: row.TCP,
    sourceId: row.TCP,
    titleMatch: "",
    authorMatch: "",
  } as CanonWork;
  const base: Candidate = {
    id: row.TCP,
    title: row.Title,
    author: null,
    year: null,
    cc0: false,
    lostPer1000: 0,
    gapsPer1000: 0,
    chars: 0,
    chunks: 0,
    reason: "",
  };
  try {
    const raw = await fetchRaw(work);
    const head = parseHeader(raw);
    const cc0 = CC0.test(head.availability ?? "");
    if (!cc0)
      return {
        ...base,
        title: head.title ?? row.Title,
        reason: "ingen CC0-rad",
      };

    const { text, gaps, lostWords, words } = toTcpText(raw, work);
    const lost = words > 0 ? (lostWords / words) * 1000 : 0;
    const density = words > 0 ? (gaps / words) * 1000 : 0;
    const chunks = chunkText(text, "en").filter((c) => !c.isFrontMatter);
    const candidate: Candidate = {
      ...base,
      title: head.title ?? row.Title,
      author: head.author,
      year: head.year,
      cc0,
      lostPer1000: lost,
      gapsPer1000: density,
      chars: text.length,
      chunks: chunks.length,
    };
    if (lost > MAX_LOST_WORDS_PER_1000) {
      return {
        ...candidate,
        reason: `${lost.toFixed(1)} förlorade ord/1000 — förlagan för skadad`,
      };
    }
    if (text.length < MIN_CHARS) return { ...candidate, reason: "för kort" };
    return candidate;
  } catch (err) {
    return {
      ...base,
      reason: err instanceof Error ? err.message.slice(0, 64) : "fel",
    };
  }
}

/** The title as duplicate key: TCP often has the same work in several printings. */
const titleKey = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);

async function main() {
  const dry = process.argv.includes("--dry");
  const listAuthors = process.argv.includes("--authors");

  const rows = await catalogue();
  console.log(`Katalogen: ${rows.length} texter`);

  if (listAuthors) {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.Author, (counts.get(r.Author) ?? 0) + 1);
    // slice(2): argv[0] is the node path and argv[1] the script, and neither starts with "--".
    const needle = process.argv.slice(2).find((a) => !a.startsWith("--"));
    for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
      if (n < 3) continue;
      if (needle && !name.toLowerCase().includes(needle.toLowerCase()))
        continue;
      console.log(`  ${String(n).padStart(4)}  ${name}`);
    }
    return;
  }

  const existing = new Set(
    CORPUS.filter((w) => w.source !== "tcp").map((w) => w.author.toLowerCase()),
  );
  const works: CanonWork[] = [];
  const overlap: string[] = [];

  for (const author of AUTHORS) {
    // Exact string, never substring: the catalog has two James Harringtons
    // and two Thomas Brownes, and the years are the only thing that tells
    // them apart.
    //
    // But the comparison runs against the FIRST component, not the whole
    // field. TCP packs co-editors, translators, and uniform titles after a
    // semicolon into the same `Author` — "Conway, Anne, 1631-1679.;
    // Crull, J. (Jodocus), d. 1713?" — and matching against the whole
    // field lost exactly the major works: Conway, John Smith, and
    // Whichcote each got zero matches, and Culverwel got a stray text
    // instead of `Discourse of the Light of Nature`. The first component
    // is the source's primary author, and the split is the same one the
    // Gutenberg part already does.
    const matched = rows.filter(
      (r) =>
        r.Author.split(";")[0].trim() === author.name && !DENY_IDS.has(r.TCP),
    );
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
    for (const row of matched) evaluated.push(await evaluate(row));

    const ok = evaluated.filter((c) => c.reason === "");
    const rejected = evaluated.filter((c) => c.reason !== "");

    // One entry per work. The same writing was reprinted, and the catalog
    // has each printing as its own row; the fullest transcription wins.
    const byTitle = new Map<string, Candidate>();
    for (const c of ok.sort((a, b) => b.chars - a.chars)) {
      const key = titleKey(c.title);
      if (!byTitle.has(key)) byTitle.set(key, c);
    }

    const kept = [...byTitle.values()]
      .sort(
        (a, b) =>
          Number(PRIORITY_IDS.has(b.id)) - Number(PRIORITY_IDS.has(a.id)) ||
          b.chars - a.chars,
      )
      .slice(0, MAX_WORKS_PER_AUTHOR);

    for (const c of kept) {
      console.log(
        `  ✓ ${String(c.year ?? "?").padStart(4)}  ${String(Math.round(c.chars / 1000)).padStart(4)}k  ` +
          `${String(c.chunks).padStart(4)} st  ${c.lostPer1000.toFixed(1).padStart(4)} förl` +
          `/${c.gapsPer1000.toFixed(0).padStart(3)} luck  ${c.title.slice(0, 46)}`,
      );
      works.push({
        id: `tcp-${slug(author.display)}-${slug(c.title).slice(0, 40)}`,
        source: "tcp",
        sourceId: c.id,
        author: author.display,
        title: c.title.slice(0, 180),
        genre: author.genre,
        language: "en",
        year: author.death,
        era: eraOf(author.death),
        titleMatch: "",
        // The file's own author field, not the catalog's. They usually
        // agree here, but the Perseus part showed what it costs when they diverge.
        authorMatch: (c.author ?? "").toLowerCase().slice(0, 60),
      });
    }

    for (const c of rejected.slice(0, 4)) {
      console.log(`      ✗ ${c.title.slice(0, 46).padEnd(46)} ${c.reason}`);
    }
    if (rejected.length > 4)
      console.log(`      … och ${rejected.length - 4} till`);
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
      `\n${overlap.length} författare finns redan i samlingen och får nu sin förstautgåva ` +
        `vid sidan av den senare: ${overlap.join(", ")}`,
    );
  }

  writeManifest(OUT_PATH, works, dry);
  if (!dry) console.log("Kör `pnpm ingest --source=tcp` för att indexera.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
