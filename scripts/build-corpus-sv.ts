/**
 * Generates the Swedish part of the collection manifest (`src/lib/corpus-sv.json`).
 *
 *   pnpm build-corpus-sv            regenerate
 *   pnpm build-corpus-sv --dry      show the report without writing the file
 *   pnpm build-corpus-sv --refresh  refetch Litteraturbanken's catalog
 *
 * Two sources, for different reasons:
 *
 * LITTERATURBANKEN has proofread editions of almost the whole Swedish canon
 * and a catalog API to select from — the same approach as the Gutenberg part.
 * But only some of the editions are free: Strindberg's Samlade Verk and the
 * Vitterhetssamfundet's Almqvist are listed there under licenses that
 * explicitly forbid redistribution. Only `cc-0` is picked, and `verifyHeader`
 * checks this again when the text is actually fetched.
 *
 * PROJEKT RUNEBERG fills the gap it leaves. Strindberg is the most important
 * Swedish author in this collection and exists at Litteraturbanken only in the
 * protected edition; Runeberg has the old free ones. Runeberg has no catalog
 * to query this way, and half its works exist only as unproofread OCR, so
 * they're entered one at a time with a hand-checked title key.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "../src/lib/db";
import type { CanonWork, Genre } from "../src/lib/corpus";
import { eraOf } from "./lib/era";
import { writeManifest } from "./lib/manifest";

const CATALOG_URL = "https://litteraturbanken.se/api/list_all/etext?to=4000";
const CATALOG_CACHE = path.join(CACHE_DIR, "lb-catalog.json");
const OUT_PATH = path.join(process.cwd(), "src", "lib", "corpus-sv.json");

/**
 * The only license that reliably permits the text to be downloaded and
 * indexed. Litteraturbanken's other licenses — lb-2, lb-assv, lb-svs, lb-sa —
 * are editions they're allowed to publish but not redistribute.
 */
const FREE_LICENSE = "cc-0";

/* ------------------------------------------------------------------ *
 * The author lists — Litteraturbanken
 *
 * The strings must be the catalog's exact `name_for_index`, i.e. "Surname,
 * Given name". The generator warns if a name yields no works.
 *
 * An author belongs to exactly ONE list, just as in the Gutenberg part: the
 * list sets the genre for everything they wrote. Boye is listed under "dikt"
 * (poetry) even though Kallocain is a novel, Söderberg under "prosa" (prose)
 * even though Gertrud is a play. That's the price of one label per author, and
 * that price is already paid in the English collection.
 * ------------------------------------------------------------------ */

/** Essays and aphorisms — the Swedish counterpart to the treatise. */
const ESSA = [
  "Ekelund, Vilhelm",
  "Bengtsson, Frans G.",
  "Levertin, Oscar",
  "Ruin, Hans",
  "Atterbom, P.D.A.",
];

/** Social thought: the women's question, upbringing, class society. */
const POLITIK = ["Key, Ellen", "Schwartz, Marie Sophie", "Wahlström, Lydia"];

const HISTORIA = ["Geijer, Erik Gustaf"];

const RELIGION = ["Söderblom, Nathan"];

const DRAMA = ["Lybeck, Mikael", "Värnlund, Rudolf", "Leffler, Anne Charlotte"];

const DIKT = [
  "Fröding, Gustaf",
  "Karlfeldt, Erik Axel",
  "Södergran, Edith",
  "Boye, Karin",
  "Tegnér, Esaias",
  "Andersson, Dan",
  "Sjöberg, Birger",
  "Hansson, Ola",
  "Tavaststjerna, Karl August",
  "Hemmer, Jarl",
  "Franzén, Frans Michael",
  "Wallin, Johan Olof",
  "Kellgren, Johan Henric",
  "Söderholm, Kerstin",
  "Jändel, Ragnar",
  "Ek, Karin",
  "Nyberg, Julia Christina",
];

const PROSA = [
  "Lagerlöf, Selma",
  "Bergman, Hjalmar",
  "Söderberg, Hjalmar",
  "Heidenstam, Verner von",
  "Krusenstjerna, Agnes von",
  "Dagerman, Stig",
  "Benedictsson, Victoria",
  "Wägner, Elin",
  "Hellström, Gustaf",
  "Flygare-Carlén, Emilie",
  "Elkan, Sophie",
  "Berger, Henning",
  "Koch, Martin",
  "Sandel, Maria",
  "Nordström, Ester Blenda",
  "Stiernstedt, Marika",
  "Engström, Albert",
  "Geijerstam, Gustaf af",
  "Lundegård, Axel",
  "Agrell, Alfhild",
  "Angered-Strandberg, Hilma",
  "Schildt, Runar",
  "Högberg, Olof",
  "Knorring, Sophie von",
];

/**
 * The caps are lower than in the Gutenberg part. Swedish prose is richly
 * represented at Litteraturbanken — Lagerlöf alone has 42 free works — and a
 * collection where she fills a twentieth of it answers a question worse, not better.
 */
const GROUPS: {
  authors: string[];
  cap: number;
  label: string;
  genre: Genre;
}[] = [
  { authors: ESSA, cap: 8, label: "essä", genre: "essä" },
  { authors: POLITIK, cap: 8, label: "politisk teori", genre: "politik" },
  { authors: HISTORIA, cap: 8, label: "historia", genre: "historia" },
  { authors: RELIGION, cap: 4, label: "religion", genre: "religion" },
  { authors: DRAMA, cap: 6, label: "drama", genre: "drama" },
  { authors: DIKT, cap: 6, label: "dikt & epos", genre: "dikt" },
  { authors: PROSA, cap: 5, label: "prosa", genre: "prosa" },
];

/**
 * Works from Projekt Runeberg, one at a time.
 *
 * `sourceId` is Runeberg's title key — it appears in the URL, runeberg.org/rodarum/.
 * Each key is checked with `scripts/.probe-runeberg.ts`: the work must have
 * proofread HTML chapters, not just scanned OCR pages. Half of Runeberg's
 * Strindberg entries failed that check.
 *
 * `year` is the author's year of death, as in the rest of the collection.
 */
const RUNEBERG: {
  sourceId: string;
  author: string;
  title: string;
  year: number;
  genre: Genre;
  /** Substring from the archive's Metadata file. */
  titleMatch: string;
  /** Runeberg's author key, from the same file. */
  authorMatch: string;
}[] = [
  {
    sourceId: "rodarum",
    author: "August Strindberg",
    title: "Röda rummet",
    year: 1912,
    genre: "prosa",
    titleMatch: "röda rummet",
    authorMatch: "strindbg",
  },
  {
    sourceId: "afventyr",
    author: "August Strindberg",
    title: "Svenska öden och äfventyr",
    year: 1912,
    genre: "prosa",
    titleMatch: "svenska öden",
    authorMatch: "strindbg",
  },
  {
    sourceId: "frkjulie",
    author: "August Strindberg",
    title: "Fröken Julie",
    year: 1912,
    genre: "drama",
    titleMatch: "fröken julie",
    authorMatch: "strindbg",
  },
  {
    sourceId: "fadren",
    author: "August Strindberg",
    title: "Fadren",
    year: 1912,
    genre: "drama",
    titleMatch: "fadren",
    authorMatch: "strindbg",
  },
  {
    sourceId: "dromspel",
    author: "August Strindberg",
    title: "Ett drömspel",
    year: 1912,
    genre: "drama",
    titleMatch: "drömspel",
    authorMatch: "strindbg",
  },
  {
    sourceId: "dodsdans",
    author: "August Strindberg",
    title: "Dödsdansen",
    year: 1912,
    genre: "drama",
    titleMatch: "dödsdansen",
    authorMatch: "strindbg",
  },
  {
    sourceId: "mastolof",
    author: "August Strindberg",
    title: "Mäster Olof",
    year: 1912,
    genre: "drama",
    titleMatch: "mäster olof",
    authorMatch: "strindbg",
  },
  {
    sourceId: "damaskus",
    author: "August Strindberg",
    title: "Till Damaskus",
    year: 1912,
    genre: "drama",
    titleMatch: "till damaskus",
    authorMatch: "strindbg",
  },
  {
    sourceId: "vasa",
    author: "August Strindberg",
    title: "Gustav Vasa",
    year: 1912,
    genre: "drama",
    titleMatch: "gustav vasa",
    authorMatch: "strindbg",
  },
  {
    sourceId: "starkare",
    author: "August Strindberg",
    title: "Den starkare",
    year: 1912,
    genre: "drama",
    titleMatch: "den starkare",
    authorMatch: "strindbg",
  },
  {
    sourceId: "drottnju",
    author: "Carl Jonas Love Almqvist",
    title: "Drottningens juvelsmycke",
    year: 1866,
    genre: "prosa",
    titleMatch: "drottningens juvelsmycke",
    authorMatch: "almqvist",
  },
  {
    sourceId: "tankebok",
    author: "Zacharias Topelius",
    title: "Blad ur min tänkebok",
    year: 1898,
    genre: "essä",
    titleMatch: "tänkebok",
    authorMatch: "topelius",
  },
];

/* ------------------------------------------------------------------ *
 * The catalog
 * ------------------------------------------------------------------ */

interface CatalogEntry {
  lbworkid: string;
  title: string;
  author: string;
  authorIndex: string;
  death: number | null;
  imprintYear: number | null;
  wordCount: number;
  proofread: boolean;
  texttype: string;
  url: string;
}

/** "1858–1940" and "1940" respectively → 1940. The catalog writes both forms. */
function parseYear(plain: string | undefined): number | null {
  const m = /(\d{3,4})\s*$/.exec((plain ?? "").trim());
  return m ? Number(m[1]) : null;
}

/**
 * Fetches the catalog and discards everything we don't need.
 *
 * The response is 41 MB, almost all of it `content_vector` — Litteraturbanken's
 * own embeddings, one per work. What's saved to disk is the projection below,
 * under a megabyte, so a rerun doesn't needlessly refetch the other forty.
 */
async function loadCatalog(refresh: boolean): Promise<CatalogEntry[]> {
  if (!refresh && fs.existsSync(CATALOG_CACHE)) {
    return JSON.parse(fs.readFileSync(CATALOG_CACHE, "utf8")) as CatalogEntry[];
  }

  console.log("Hämtar Litteraturbankens katalog (~40 MB) …");
  const res = await fetch(CATALOG_URL, {
    headers: { "User-Agent": "canon-indexer/0.1 (personal research project)" },
  });
  if (!res.ok)
    throw new Error(`Litteraturbanken svarade ${res.status} ${res.statusText}`);

  const body = (await res.json()) as {
    data: {
      lbworkid: string;
      title: string;
      license: string;
      language: string;
      imprintyear?: string;
      word_count?: number;
      proofread?: boolean;
      texttype?: string;
      url?: string;
      export?: { type: string }[];
      main_author?: {
        full_name?: string;
        name_for_index?: string;
        death?: { plain?: string };
      };
    }[];
  };

  const entries: CatalogEntry[] = body.data
    .filter(
      (r) =>
        r.license === FREE_LICENSE &&
        r.language === "swe" &&
        r.main_author?.name_for_index &&
        // Without a txt export there's no text to fetch.
        (r.export ?? []).some((e) => e.type === "txt"),
    )
    .map((r) => ({
      lbworkid: r.lbworkid,
      title: r.title,
      author: r.main_author!.full_name ?? r.main_author!.name_for_index!,
      authorIndex: r.main_author!.name_for_index!,
      death: parseYear(r.main_author!.death?.plain),
      imprintYear: parseYear(r.imprintyear),
      wordCount: r.word_count ?? 0,
      proofread: r.proofread ?? false,
      texttype: r.texttype ?? "",
      url: r.url ? `https://litteraturbanken.se${r.url}` : "",
    }));

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CATALOG_CACHE, JSON.stringify(entries), "utf8");
  console.log(
    `${entries.length} fritt licensierade svenska verk i katalogen.\n`,
  );
  return entries;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[àáâãä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[å]/g, "a")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Title key for the duplicate filter. Litteraturbanken has the same work in
 * multiple editions — "Gösta Berlings saga. Skrifter av Selma Lagerlöf [1933]"
 * and "Gösta Berlings saga. Förra delen [vetenskaplig utgåva]" are the same
 * novel — and the subtitle is the only thing distinguishing them.
 */
const titleKey = (t: string) =>
  slug(t.split(/[.:;[(]/)[0]).replace(/^(den|det|de|en|ett)-/, "");

/** Works shorter than this are poems, speeches and fragments — too little to carry an answer. */
const MIN_WORDS = 2500;

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

async function main() {
  const dry = process.argv.includes("--dry");
  const catalog = await loadCatalog(process.argv.includes("--refresh"));

  const works: CanonWork[] = [];
  const usedIds = new Set<string>();
  const unknown: string[] = [];
  const allFiltered: string[] = [];
  const perAuthor: [string, number][] = [];

  for (const { authors, cap, label, genre } of GROUPS) {
    for (const key of authors) {
      const byAuthor = catalog.filter((r) => r.authorIndex === key);

      const seen = new Set<string>();
      const matches = byAuthor
        .filter((r) => r.wordCount >= MIN_WORDS)
        // Proofread before unproofread, then the fullest edition: of two
        // editions of the same novel, the longer one is the complete one, not
        // the abridged one.
        .sort(
          (a, b) =>
            Number(b.proofread) - Number(a.proofread) ||
            b.wordCount - a.wordCount,
        )
        .filter((r) => {
          const k = titleKey(r.title);
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, cap);

      if (matches.length === 0) {
        if (byAuthor.length === 0) unknown.push(`${key}  (${label})`);
        else
          allFiltered.push(
            `${key}  (${label}) — ${byAuthor.length} verk, alla bortfiltrerade`,
          );
        continue;
      }
      perAuthor.push([key, matches.length]);

      for (const row of matches) {
        // Year of death, not year of publication. The catalog has both, but
        // the rest of the collection dates by author, and the UI groups by
        // author: two Lagerlöf works under two different years would leave
        // the group with an arbitrary one of them.
        const year = row.death ?? row.imprintYear ?? 0;

        let id = `lb-${slug(key.split(",")[0])}-${slug(row.title)}`.slice(
          0,
          60,
        );
        if (usedIds.has(id)) id = `${id}-${row.lbworkid}`;
        usedIds.add(id);

        works.push({
          id,
          source: "litteraturbanken",
          sourceId: row.lbworkid,
          sourceUrl: row.url || undefined,
          author: row.author,
          title: row.title,
          genre,
          language: "sv",
          year,
          era: eraOf(year),
          // Litteraturbanken's file header opens with exactly this title and,
          // on the line below, the author's name with life dates.
          titleMatch: row.title.toLowerCase().slice(0, 24),
          authorMatch: row.author.toLowerCase(),
        });
      }
    }
  }

  for (const extra of RUNEBERG) {
    let id =
      `rb-${slug(extra.author.split(" ").pop() ?? extra.author)}-${slug(extra.title)}`.slice(
        0,
        60,
      );
    if (usedIds.has(id)) id = `${id}-${extra.sourceId}`;
    usedIds.add(id);

    works.push({
      id,
      source: "runeberg",
      sourceId: extra.sourceId,
      author: extra.author,
      title: extra.title,
      genre: extra.genre,
      language: "sv",
      year: extra.year,
      era: eraOf(extra.year),
      titleMatch: extra.titleMatch,
      authorMatch: extra.authorMatch,
    });
    perAuthor.push([extra.author, 1]);
  }

  works.sort(
    (a, b) => a.year - b.year || a.author.localeCompare(b.author, "sv"),
  );

  /* -------- report -------- */
  const bySource = new Map<string, number>();
  for (const w of works)
    bySource.set(w.source, (bySource.get(w.source) ?? 0) + 1);
  console.log(`\n${works.length} svenska verk`);
  console.log(
    "per källa: " + [...bySource].map(([s, n]) => `${s} ${n}`).join(" · "),
  );

  const byGenre = new Map<string, number>();
  for (const w of works) byGenre.set(w.genre, (byGenre.get(w.genre) ?? 0) + 1);
  console.log(
    "per genre: " +
      [...byGenre]
        .sort((a, b) => b[1] - a[1])
        .map(([g, n]) => `${g} ${n}`)
        .join(" · "),
  );

  const top = [...perAuthor].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(
    "flest verk: " + top.map(([a, n]) => `${a.split(",")[0]} ${n}`).join(" · "),
  );

  if (unknown.length > 0) {
    console.error(
      `\n⚠  ${unknown.length} namn finns INTE bland de fria verken:`,
    );
    for (const m of unknown) console.error(`     ${m}`);
    console.error(
      '   Antingen är namnformen fel (den ska vara exakt "Efternamn, Förnamn"),',
    );
    console.error(
      "   eller så ligger författarens verk hos Litteraturbanken under en",
    );
    console.error("   licens som inte tillåter att de hämtas ned.");
  }
  if (allFiltered.length > 0) {
    console.error(
      `\n⚠  ${allFiltered.length} författare fick alla sina verk bortfiltrerade:`,
    );
    for (const m of allFiltered) console.error(`     ${m}`);
  }

  // The same work in two languages isn't a bug — Strindberg's original is
  // better than Gutenberg's translation of it — but it should be visible, not
  // discovered in a results list where two cards say the same thing.
  const english = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "corpus.json"),
      "utf8",
    ),
  ) as { author: string; title: string }[];
  const englishAuthors = new Set(english.map((w) => w.author));
  const overlap = [
    ...new Set(
      works.filter((w) => englishAuthors.has(w.author)).map((w) => w.author),
    ),
  ];
  if (overlap.length > 0) {
    console.log(
      `\nFinns även i engelsk översättning i Gutenbergdelen: ${overlap.join(", ")}.` +
        `\n  Originalet väger tyngre än översättningen, så båda får vara kvar — men` +
        `\n  författaren kan nu bidra med stycken på två språk till samma svar.`,
    );
  }

  writeManifest(OUT_PATH, works, dry);
  if (!dry) console.log("Kör `pnpm ingest` för att indexera.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
