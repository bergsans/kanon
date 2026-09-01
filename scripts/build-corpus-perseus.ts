/**
 * Generates the Perseus part of the manifest (`src/lib/corpus-perseus.json`).
 *
 *   pnpm build-corpus-perseus           regenerate
 *   pnpm build-corpus-perseus --dry     show the report without writing the file
 *   pnpm build-corpus-perseus --authors list the catalog's name forms and stop
 *
 * Perseus has, unlike MIA, a real catalog. Every text group (author) and
 * every work carries a `__cts__.xml` with its name, and the archive tree
 * can be fetched in one call via GitHub's tree API. The generator reads
 * the tree, looks up the author names, and evaluates every English
 * translation it finds.
 *
 * TWO INDEPENDENT GROUNDS FOR ADMITTING A TEXT — see `rightsGround` in
 * `src/lib/perseus.ts`. Either the translation is free by its age, or
 * Perseus has licensed it. The report prints which ground each work was
 * admitted on and why the rejected ones fell, so the selection can be
 * audited rather than trusted.
 *
 * THE OVERLAP WITH GUTENBERG IS DELIBERATELY VISIBLE. Thirty-four of
 * antiquity's authors are already in the collection via Gutenberg, and a
 * line here that happens to add one of them adds *a second edition of the
 * same work*. Sometimes that's right — Perseus's citation is "Book 1,
 * Chapter 22" where Gutenberg's is nothing — but it's a decision, not a
 * side effect. The report lists them.
 */
import fs from "node:fs";
import path from "node:path";
import { CORPUS } from "../src/lib/corpus";
import { CACHE_DIR } from "../src/lib/db";
import { chunkText } from "../src/lib/chunk";
import {
  fetchRaw,
  FREE_BY_AGE,
  MODERN_IMPRINT,
  parseHeader,
  readerUrl,
  rightsGround,
  toText,
} from "../src/lib/perseus";
import type { CanonWork, Genre } from "../src/lib/corpus";
import { eraOf } from "./lib/era";
import { assertNoDuplicateIds, writeManifest } from "./lib/manifest";

const OUT_PATH = path.join(process.cwd(), "src", "lib", "corpus-perseus.json");

const REPOS = [
  ["greekLit", "canonical-greekLit"],
  ["latinLit", "canonical-latinLit"],
] as const;

/** How many works at most per author. A cap, not a target. */
const MAX_WORKS_PER_AUTHOR = 14;

/**
 * How short a text may be and still become a work.
 *
 * The archives are full of fragments and single speeches — one of
 * Lysias's court speeches is three pages, and a manifest entry per one
 * would make no collection, only a list. The figure is set so that a
 * work yields at least a dozen chunks to search in.
 */
const MIN_CHARS = 12_000;

interface Author {
  /** The catalog's `ti:groupname`, verbatim. The generator warns on zero matches. */
  name: string;
  /**
   * Which language edition to pick. Omitted means English translation.
   * `"lat"` gives the original instead — see `LATIN_AUTHORS`.
   */
  edition?: "eng" | "lat";
  /** The name as it should appear in the interface. The catalog's form isn't always readable. */
  display: string;
  genre: Genre;
  /** Death year, negative = BCE. Becomes `year` and thereby era and chronological sort. */
  death: number;
}

/**
 * The authors included.
 *
 * The selection is built around what Perseus *adds*, not around what
 * already exists. The canon of antiquity is largely already in the
 * collection via Gutenberg, and those lines would be a second edition of
 * the same work. What's missing falls broadly into two groups: the Greek
 * orators, and the Latin prose that never became a popular edition.
 */
const AUTHORS: Author[] = [
  // THE ORATORS. Rhetoric is the only one of antiquity's major genres
  // entirely absent from the collection, and it's no curiosity: a
  // question about citizenship, law, or the justification of war is in
  // practice answered by someone who stood before an assembly and had to
  // persuade it. Attica's ten orators exist at Perseus almost completely
  // and at Gutenberg hardly at all.
  {
    name: "Demosthenes",
    display: "Demosthenes",
    genre: "politik",
    death: -322,
  },
  { name: "Isocrates", display: "Isokrates", genre: "politik", death: -338 },
  { name: "Lysias", display: "Lysias", genre: "politik", death: -380 },
  { name: "Isaeus", display: "Isaios", genre: "politik", death: -340 },
  { name: "Aeschines", display: "Aischines", genre: "politik", death: -314 },
  { name: "Antiphon", display: "Antifon", genre: "politik", death: -411 },
  { name: "Hyperides", display: "Hypereides", genre: "politik", death: -322 },
  { name: "Andocides", display: "Andokides", genre: "politik", death: -390 },
  { name: "Dinarchus", display: "Deinarchos", genre: "politik", death: -291 },
  { name: "Lycurgus", display: "Lykurgos", genre: "politik", death: -324 },

  // The historians and geographers Gutenberg lacks.
  {
    name: "Appianus of Alexandria",
    display: "Appianos",
    genre: "historia",
    death: 165,
  },
  { name: "Pausanias", display: "Pausanias", genre: "historia", death: 180 },
  { name: "Strabo", display: "Strabon", genre: "historia", death: 24 },
  {
    name: "Ammianus Marcellinus",
    display: "Ammianus Marcellinus",
    genre: "historia",
    death: 400,
  },

  // Prose and essay.
  { name: "Quintilian", display: "Quintilianus", genre: "essä", death: 100 },
  {
    name: "Gellius, Aulus",
    display: "Aulus Gellius",
    genre: "essä",
    death: 180,
  },
  {
    name: "Athenaeus of Naucratis",
    display: "Athenaios",
    genre: "essä",
    death: 230,
  },
  { name: "Apuleius", display: "Apuleius", genre: "prosa", death: 180 },
  {
    name: "Apollodorus",
    display: "Apollodoros",
    genre: "religion",
    death: 120,
  },

  // Poetry. The Homeric Hymns are listed under their traditional name for
  // the same reason as the Bible and Beowulf in the Gutenberg part: there's
  // no author to group by, and the traditional name is the only grouping
  // that means anything in the interface.
  { name: "Pindar", display: "Pindaros", genre: "dikt", death: -438 },
  { name: "Bacchylides", display: "Bacchylides", genre: "dikt", death: -451 },
  {
    name: "Homeric Hymns",
    display: "Homeriska hymnerna",
    genre: "dikt",
    death: -600,
  },
  {
    name: "Catullus, C. Valerius",
    display: "Catullus",
    genre: "dikt",
    death: -54,
  },
  { name: "Tibullus", display: "Tibullus", genre: "dikt", death: -19 },
  { name: "Lucan", display: "Lucanus", genre: "dikt", death: 65 },
  { name: "Claudian", display: "Claudianus", genre: "dikt", death: 404 },
  {
    name: "Ausonius, Decimus Magnus",
    display: "Ausonius",
    genre: "dikt",
    death: 395,
  },

  // Science. The collection's smallest genre — 29 works — and the only
  // one where antiquity had so far only been represented from Galileo onward.
  {
    name: "Hippocrates",
    display: "Hippokrates",
    genre: "vetenskap",
    death: -370,
  },
  { name: "Galen", display: "Galenos", genre: "vetenskap", death: 216 },
  { name: "Euclid", display: "Euklides", genre: "vetenskap", death: -265 },
  {
    name: "Pliny, the Elder",
    display: "Plinius den äldre",
    genre: "vetenskap",
    death: 79,
  },
  {
    name: "Celsus, Aulus Cornelius",
    display: "Celsus",
    genre: "vetenskap",
    death: 50,
  },
  {
    name: "Aretaeus of Cappadocia",
    display: "Aretaios",
    genre: "vetenskap",
    death: 90,
  },
  {
    name: "Columella, Lucius Junius Moderatus",
    display: "Columella",
    genre: "vetenskap",
    death: 70,
  },
  {
    name: "Vitruvius Pollio",
    display: "Vitruvius",
    genre: "vetenskap",
    death: -15,
  },
];

/**
 * Latin ORIGINALS, alongside the English translations.
 *
 * THIS IS DUPLICATION, NOT A GAP, and the difference is worth being clear
 * about. Perseus's latinLit has 430 Latin texts but **no Augustine and no
 * Aquinas** — only Boethius among the patristic and medieval authors. The
 * Latin therefore doesn't fill the gap between antiquity and the
 * Renaissance; it gives the original of works whose English translation
 * is already in the collection.
 *
 * Why it's worth having anyway: the original carries more weight than the
 * translation, which is the same reason Runeberg and DTA exist. A question
 * about *pietas*, *virtus*, or *fortuna* hits the words themselves instead
 * of a 19th-century English paraphrase of them.
 *
 * That the Latin works in the pipeline is measured in
 * `.probe-rerank-more.ts`: Descartes's *Meditationes* gave a top-10 of 7.0
 * and ρ 0.841 with a score spread of 0.099 against the English control's
 * 0.133 — same work, same questions. The Latin sits slightly below the
 * English but in the same range, and clearly above the Spanish.
 */
const LATIN_AUTHORS: Author[] = [
  {
    name: "Cicero, Marcus Tullius",
    display: "Marcus Tullius Cicero",
    genre: "filosofi",
    death: -43,
    edition: "lat",
  },
  {
    name: "Vergil",
    display: "Vergilius",
    genre: "dikt",
    death: -19,
    edition: "lat",
  },
  {
    name: "Ovid",
    display: "Ovidius",
    genre: "dikt",
    death: 17,
    edition: "lat",
  },
  {
    name: "Horace",
    display: "Horatius",
    genre: "dikt",
    death: -8,
    edition: "lat",
  },
  {
    name: "Tacitus, Cornelius",
    display: "Cornelius Tacitus",
    genre: "historia",
    death: 120,
    edition: "lat",
  },
  {
    name: "Titus Livius (Livy)",
    display: "Livius",
    genre: "historia",
    death: 17,
    edition: "lat",
  },
  {
    name: "Seneca, Lucius Annaeus",
    display: "Seneca",
    genre: "filosofi",
    death: 65,
    edition: "lat",
  },
  {
    name: "Lucretius",
    display: "Lucretius",
    genre: "filosofi",
    death: -55,
    edition: "lat",
  },
  {
    name: "Julius Caesar",
    display: "Julius Caesar",
    genre: "historia",
    death: -44,
    edition: "lat",
  },
  {
    name: "Sallust",
    display: "Sallustius",
    genre: "historia",
    death: -35,
    edition: "lat",
  },
  {
    name: "Suetonius",
    display: "Suetonius",
    genre: "historia",
    death: 122,
    edition: "lat",
  },
  {
    name: "Juvenal",
    display: "Juvenalis",
    genre: "dikt",
    death: 130,
    edition: "lat",
  },
  {
    name: "Apuleius",
    display: "Apuleius",
    genre: "prosa",
    death: 180,
    edition: "lat",
  },
  {
    name: "Boethius",
    display: "Boethius",
    genre: "filosofi",
    death: 524,
    edition: "lat",
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

/** Fetches a catalog file, with disk cache. The tree and every `__cts__.xml` go through here. */
async function fetchCatalog(url: string, key: string): Promise<string> {
  const dir = path.join(CACHE_DIR, "perseus-catalog");
  fs.mkdirSync(dir, { recursive: true });
  const cached = path.join(dir, `${key.replace(/[^a-z0-9._-]+/gi, "_")}`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");

  const res = await fetch(url, {
    headers: { "User-Agent": "canon-indexer/0.1 (personal research project)" },
  });
  if (!res.ok)
    throw new Error(`Perseus-katalogen ${url} svarade ${res.status}`);
  const body = await res.text();
  fs.writeFileSync(cached, body, "utf8");
  return body;
}

interface Edition {
  urn: string;
  /** The text group's id in the catalog, e.g. "tlg0003". */
  group: string;
  /** The work's id within the group, e.g. "tlg001". */
  work: string;
}

/**
 * All files in a given language in an archive, from GitHub's tree API.
 *
 * The language is the last part of the edition's id — `perseus-eng4`,
 * `1st1K-ger2`, `phi0474.phi056.perseus-lat1`.
 */
async function editionsIn(
  namespace: string,
  repo: string,
  lang: string,
): Promise<Edition[]> {
  const tree = JSON.parse(
    await fetchCatalog(
      `https://api.github.com/repos/PerseusDL/${repo}/git/trees/master?recursive=1`,
      `${repo}.tree.json`,
    ),
  ) as { tree: { path: string }[]; truncated?: boolean };

  const out: Edition[] = [];
  for (const { path: p } of tree.tree) {
    const m = /^data\/([^/]+)\/([^/]+)\/\1\.\2\.([^/]+)\.xml$/.exec(p);
    if (!m) continue;
    const [, group, work, edition] = m;
    if (!new RegExp(`-${lang}\\d*$`).test(edition)) continue;
    out.push({
      urn: `urn:cts:${namespace}:${group}.${work}.${edition}`,
      group,
      work,
    });
  }
  return out;
}

function ctsField(xml: string, tag: string): string | null {
  const m = new RegExp(`<ti:${tag}\\b[^>]*>([\\s\\S]*?)</ti:${tag}>`, "i").exec(
    xml,
  );
  return m
    ? m[1]
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : null;
}

/** The text group's name — the author, as the catalog credits it. */
async function groupName(repo: string, group: string): Promise<string | null> {
  const xml = await fetchCatalog(
    `https://raw.githubusercontent.com/PerseusDL/${repo}/master/data/${group}/__cts__.xml`,
    `${repo}.${group}.cts.xml`,
  ).catch(() => "");
  return xml ? ctsField(xml, "groupname") : null;
}

/** The work's title, as the catalog writes it. */
async function workTitle(
  repo: string,
  group: string,
  work: string,
): Promise<string | null> {
  const xml = await fetchCatalog(
    `https://raw.githubusercontent.com/PerseusDL/${repo}/master/data/${group}/${work}/__cts__.xml`,
    `${repo}.${group}.${work}.cts.xml`,
  ).catch(() => "");
  return xml ? ctsField(xml, "title") : null;
}

interface Candidate {
  urn: string;
  title: string;
  /** The author as *the file itself* credits it. See `authorMatch` below. */
  author: string | null;
  translator: string | null;
  imprintYear: number | null;
  ground: "ålder" | "licens" | null;
  chars: number;
  chunks: number;
  reason: string;
}

async function evaluate(
  urn: string,
  fallbackTitle: string,
): Promise<Candidate> {
  const work = {
    id: urn,
    sourceId: urn,
    titleMatch: "",
    authorMatch: "",
  } as CanonWork;
  const base: Candidate = {
    urn,
    title: fallbackTitle,
    author: null,
    translator: null,
    imprintYear: null,
    ground: null,
    chars: 0,
    chunks: 0,
    reason: "",
  };
  try {
    const raw = await fetchRaw(work);
    const head = parseHeader(raw);
    const ground = rightsGround(head);
    const candidate: Candidate = {
      ...base,
      title: head.title ?? fallbackTitle,
      author: head.author,
      translator: head.translator,
      imprintYear: head.imprintYear,
      ground,
    };
    if (!ground) {
      return {
        ...candidate,
        reason: `tryckt ${head.imprintYear ?? "?"}, licens: ${head.licence ?? "(saknas)"}`,
      };
    }
    const text = toText(raw, work);
    const chunks = chunkText(text, "en").filter((c) => !c.isFrontMatter);
    if (text.length < MIN_CHARS) {
      return {
        ...candidate,
        chars: text.length,
        chunks: chunks.length,
        reason: "för kort",
      };
    }
    return { ...candidate, chars: text.length, chunks: chunks.length };
  } catch (err) {
    return {
      ...base,
      reason: err instanceof Error ? err.message.slice(0, 70) : "fel",
    };
  }
}

async function main() {
  const dry = process.argv.includes("--dry");
  const listAuthors = process.argv.includes("--authors");

  // The editions in both archives, English translations and Latin originals.
  const editions: (Edition & {
    namespace: string;
    repo: string;
    lang: string;
  })[] = [];
  for (const [namespace, repo] of REPOS) {
    for (const lang of ["eng", "lat"] as const) {
      for (const e of await editionsIn(namespace, repo, lang)) {
        editions.push({ ...e, namespace, repo, lang });
      }
    }
  }

  const groups = [...new Set(editions.map((e) => `${e.repo} ${e.group}`))];
  console.log(
    `${editions.length} engelska översättningar i ${groups.length} textgrupper — läser katalogen`,
  );

  const names = new Map<string, string>();
  let read = 0;
  for (const key of groups) {
    const [repo, group] = key.split(" ");
    const name = await groupName(repo, group);
    if (name) names.set(key, name);
    if (++read % 50 === 0) process.stdout.write(`\r  ${read}/${groups.length}`);
  }
  process.stdout.write("\r\x1b[K");

  if (listAuthors) {
    const byName = new Map<string, number>();
    for (const e of editions) {
      const n = names.get(`${e.repo} ${e.group}`);
      if (n) byName.set(n, (byName.get(n) ?? 0) + 1);
    }
    for (const [name, count] of [...byName].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${name}`);
    }
    console.log(
      `\n${byName.size} textgrupper med minst en engelsk översättning.`,
    );
    return;
  }

  // The *other* sources' authors. `CORPUS` includes the Perseus part too,
  // and without this filter the generator compares against its own
  // previous output and reports every single row as an overlap.
  const existing = new Set(
    CORPUS.filter((w) => w.source !== "perseus").map((w) =>
      w.author.toLowerCase(),
    ),
  );
  const works: CanonWork[] = [];
  const overlap: string[] = [];
  /**
   * Works that fell only on the age proxy: printed just after
   * `FREE_BY_AGE`, with no license line to fall back on. They're almost
   * certainly free in substance — Lysias's speeches in Lamb's 1930 Loeb
   * edition is the clearest case — but the source doesn't give the
   * translator's death year, and guessing it would mean guessing about a
   * right. Counted here so the cost of that caution is visible.
   */
  const nearMiss: string[] = [];

  for (const author of [...AUTHORS, ...LATIN_AUTHORS]) {
    const want = author.edition ?? "eng";
    const matched = editions.filter(
      (e) =>
        e.lang === want &&
        names.get(`${e.repo} ${e.group}`)?.toLowerCase() ===
          author.name.toLowerCase(),
    );

    console.log(
      `\n${author.display} — ${matched.length} ${want === "lat" ? "latinska original" : "engelska översättningar"}`,
    );
    if (matched.length === 0) {
      console.error(
        `  ✗ "${author.name}" finns inte som textgruppsnamn i katalogen. ` +
          `Kör --authors och kontrollera namnformen.`,
      );
      continue;
    }
    if (existing.has(author.display.toLowerCase()))
      overlap.push(author.display);

    // One translation per work. Several almost always exist, and the
    // longest is the complete one: "Vier Staatsreden aus Thucydides" is
    // four speeches out of eight books.
    const byWork = new Map<string, Candidate[]>();
    for (const e of matched) {
      const title = (await workTitle(e.repo, e.group, e.work)) ?? e.work;
      const candidate = await evaluate(e.urn, title);
      const list = byWork.get(e.work) ?? [];
      list.push(candidate);
      byWork.set(e.work, list);
    }

    const chosen: Candidate[] = [];
    const rejected: Candidate[] = [];
    for (const list of byWork.values()) {
      const ok = list.filter((c) => c.ground !== null && c.chars >= MIN_CHARS);
      if (ok.length === 0) {
        const best = list.sort((a, b) => b.chars - a.chars)[0];
        rejected.push(best);
        if (
          list.some(
            (c) =>
              c.ground === null &&
              (c.imprintYear ?? 0) > FREE_BY_AGE &&
              (c.imprintYear ?? 9999) <= MODERN_IMPRINT,
          )
        ) {
          nearMiss.push(`${author.display}: ${best.title}`);
        }
        continue;
      }
      chosen.push(ok.sort((a, b) => b.chars - a.chars)[0]);
    }

    // Ranked by amount of text and not by the work's id. The Gutenberg
    // part ranks by ascending ID and the README describes what that did
    // to Shakespeare; here length is a more reasonable proxy for
    // importance, since the major work is almost always the longest for
    // an ancient author.
    chosen.sort((a, b) => b.chars - a.chars);
    const kept = chosen.slice(0, MAX_WORKS_PER_AUTHOR);

    for (const c of kept) {
      console.log(
        `  ✓ ${c.ground === "licens" ? "licens" : "ålder "} ${String(c.imprintYear ?? "?").padStart(4)}  ` +
          `${String(Math.round(c.chars / 1000)).padStart(4)}k  ${String(c.chunks).padStart(4)} st  ${c.title.slice(0, 52)}`,
      );
      works.push({
        // The language in the ID: the same work exists in both English
        // and Latin, and without it the two would collide on the same manifest ID.
        id: `perseus-${want === "lat" ? "la-" : ""}${slug(author.display)}-${slug(c.title).slice(0, 40)}`,
        source: "perseus",
        sourceId: c.urn,
        sourceUrl: readerUrl(c.urn),
        author: author.display,
        title: c.title,
        translator: c.translator ?? undefined,
        genre: author.genre,
        language: want === "lat" ? "la" : "en",
        year: author.death,
        era: eraOf(author.death),
        titleMatch: "",
        // The file's own author field, not the catalog's and not the
        // display name. The three diverge: the catalog calls the text
        // group "Appianus of Alexandria", the file writes "Appian of
        // Alexandria", and the Homeric Hymns appear as "Anonymous". The
        // check at ingest time exists to catch a URN pointing at the
        // wrong work, and for that it's the file's own claim it has to be
        // measured against — otherwise sixteen genuine works get aborted
        // because the catalog spells the name differently.
        authorMatch: (c.author ?? "").toLowerCase().slice(0, 60),
      });
    }

    for (const c of rejected.slice(0, 4)) {
      console.log(`      ✗ ${c.title.slice(0, 44).padEnd(44)} ${c.reason}`);
    }
    if (rejected.length > 4)
      console.log(`      … och ${rejected.length - 4} till`);
    if (chosen.length > MAX_WORKS_PER_AUTHOR) {
      console.log(
        `      (${chosen.length - MAX_WORKS_PER_AUTHOR} verk över taket på ${MAX_WORKS_PER_AUTHOR})`,
      );
    }
  }

  assertNoDuplicateIds(works);
  console.log(
    `\n${works.length} verk av ${new Set(works.map((w) => w.author)).size} författare`,
  );
  if (overlap.length > 0) {
    console.log(
      `\n⚠ ${overlap.length} författare finns redan i samlingen och får nu en andra ` +
        `utgåva: ${overlap.join(", ")}`,
    );
  }
  if (nearMiss.length > 0) {
    console.log(
      `\n${nearMiss.length} verk föll bara på åldersproxyn — tryckta ` +
        `${FREE_BY_AGE + 1}–${MODERN_IMPRINT} utan licensrad. De är sannolikt fria i sak, ` +
        `men källan lämnar inte ut översättarens dödsår och det ska inte gissas. ` +
        `T.ex. ${nearMiss.slice(0, 3).join("; ")}${nearMiss.length > 3 ? " …" : ""}`,
    );
  }

  writeManifest(OUT_PATH, works, dry);
  if (!dry) console.log("Kör `pnpm ingest --source=perseus` för att indexera.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
