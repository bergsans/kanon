/**
 * Generates the Marxists Internet Archive part of the manifest (`src/lib/corpus-mia.json`).
 *
 *   pnpm build-corpus-mia          regenerate
 *   pnpm build-corpus-mia --dry    show the report without writing the file
 *
 * MIA has no catalog to query — the archive is a website. The generator reads
 * an author's index page, fetches every article it links to, and keeps the
 * ones that state where the translation comes from. The rest are printed with
 * their provenance line, so the selection can be audited instead of trusted.
 *
 * Two conditions must be met, and they are independent of each other:
 *
 *   1. The ORIGINAL is free. The author must have been dead for seventy years.
 *      That's why `death` is listed below and checked here — Gramsci died in
 *      1937, Adorno in 1969, and the difference decides whether the archive can
 *      be read at all.
 *
 *   2. The TRANSLATION is free. A free original isn't enough: the translation
 *      has its own copyright, and that's exactly what Lawrence & Wishart
 *      invoked in 2008 to get MIA to withdraw Hoare's Gramsci translations.
 *      The check lives in `src/lib/marxists.ts` and is redone on every indexing run.
 */
import path from "node:path";
import { fetchPage, parseArticle } from "../src/lib/marxists";
import { stripTags } from "../src/lib/html";
import type { CanonWork, Genre } from "../src/lib/corpus";
import { eraOf } from "./lib/era";
import { assertNoDuplicateIds, writeManifest } from "./lib/manifest";

const OUT_PATH = path.join(process.cwd(), "src", "lib", "corpus-mia.json");

/** The protection term in Sweden and the EU: the author's lifetime plus seventy years. */
const PROTECTION_YEARS = 70;

/** Maximum number of articles per archive. A cap, not a target. */
const MAX_PARTS = 90;

/**
 * The minimum number of articles for the archive to count as a work.
 *
 * A manifest work has a name — "Writings and Speeches" — and that name is a
 * promise. Luxemburg's archive has seventy-four texts but only six with a
 * documented license; calling those six her writings would be promising a
 * collection and delivering a sample. Her major work is also already in the
 * collection, via Gutenberg.
 */
const MIN_PARTS = 12;

interface Archive {
  /** The index page's path on marxists.org. */
  index: string;
  author: string;
  title: string;
  /** The author's year of death. Checked against the protection term below. */
  death: number;
  genre: Genre;
  authorMatch: string;
}

/**
 * The archives included.
 *
 * A deliberately short list. Every row is a claim that a whole author's
 * archive is readable, and that claim must be verified — not hoped for.
 * Gramsci is the obvious gap in the collection: Gutenberg doesn't have him at
 * all, and Litteraturbanken of course doesn't either.
 */
const ARCHIVES: Archive[] = [
  {
    index: "/archive/gramsci/index.htm",
    author: "Antonio Gramsci",
    title: "Politiska skrifter 1916–1936",
    death: 1937,
    genre: "politik",
    authorMatch: "gramsci",
  },
  // The two below stay in the list even though, as of this writing, they don't
  // clear the floor. The rows are cheap and the check reruns every time: if MIA
  // licenses more of its own translations, the authors will get in on their
  // own, and until then the list is a record of what has already been tried.
  //
  //   Luxemburg   6 of 74 articles — the rest are older translations with no attribution
  //   Kollontai   0 of 43 — all are Progress Publishers and Allison & Busby
  {
    index: "/archive/luxemburg/index.htm",
    author: "Rosa Luxemburg",
    title: "Skrifter och tal",
    death: 1919,
    genre: "politik",
    authorMatch: "luxemburg",
  },
  {
    index: "/archive/kollonta/index.htm",
    author: "Alexandra Kollontaj",
    title: "Skrifter om kvinnan och samhället",
    death: 1952,
    genre: "politik",
    authorMatch: "kollontai",
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

/**
 * The articles an index page links to.
 *
 * Paths are relative to the index page's directory. Links upward in the tree
 * (`../`) leave the archive — they lead to translator biographies, the license
 * page and MIA's administration — and tables of contents pointing to material
 * hosted elsewhere are skipped: they have no body text to fetch.
 */
function articleLinks(html: string, indexPath: string): string[] {
  const dir = indexPath.slice(0, indexPath.lastIndexOf("/"));
  const out: string[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(/href="([^"#?]+\.html?)"/gi)) {
    const href = m[1];
    if (
      href.startsWith("..") ||
      href.startsWith("/") ||
      href.startsWith("http")
    )
      continue;
    if (/index\.html?$/i.test(href)) continue;
    // Tables of contents and editorial scaffolding, not texts.
    if (/(contents|intro|translators|biograph|glossary)/i.test(href)) continue;
    const full = `${dir}/${href}`.replace(/\/\.\//g, "/");
    if (seen.has(full)) continue;
    seen.add(full);
    out.push(full);
  }
  return out;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const thisYear = new Date().getFullYear();
  const works: CanonWork[] = [];

  for (const archive of ARCHIVES) {
    if (archive.death + PROTECTION_YEARS >= thisYear) {
      console.error(
        `✗ ${archive.author} dog ${archive.death} och är skyddad till ` +
          `${archive.death + PROTECTION_YEARS}. Hoppas över.`,
      );
      continue;
    }

    console.log(`\n${archive.author} — läser ${archive.index}`);
    const index = await fetchPage(archive.index);
    const head = stripTags(index).slice(0, 400).toLowerCase();
    if (!head.includes(archive.authorMatch)) {
      console.error(
        `  ✗ indexsidan nämner inte "${archive.authorMatch}" — hoppar över.`,
      );
      continue;
    }

    const links = articleLinks(index, archive.index).slice(0, MAX_PARTS);
    console.log(`  ${links.length} artiklar att pröva`);

    const parts: string[] = [];
    const rejected: [string, string][] = [];

    for (const link of links) {
      let article;
      try {
        article = parseArticle(await fetchPage(link));
      } catch (err) {
        rejected.push([
          link,
          err instanceof Error ? err.message.slice(0, 60) : "fel",
        ]);
        continue;
      }
      if (article.licensed && article.text.length >= 200) parts.push(link);
      else
        rejected.push([
          link,
          article.provenance.slice(0, 74) || "(ingen proveniensrad)",
        ]);
    }

    console.log(
      `  ✓ ${parts.length} med belagd licens, ${rejected.length} utan`,
    );
    for (const [link, why] of rejected.slice(0, 6)) {
      console.log(
        `      ${link.split("/").slice(-2).join("/").padEnd(34)} ${why}`,
      );
    }
    if (rejected.length > 6)
      console.log(`      … och ${rejected.length - 6} till`);

    if (parts.length < MIN_PARTS) {
      console.error(
        `  ✗ bara ${parts.length} artiklar med belagd licens — under golvet på ` +
          `${MIN_PARTS}. ${archive.author} tas inte med.`,
      );
      continue;
    }

    works.push({
      id: `mia-${slug(archive.author)}`,
      source: "marxists",
      sourceId: archive.index,
      author: archive.author,
      title: archive.title,
      genre: archive.genre,
      language: "en",
      year: archive.death,
      era: eraOf(archive.death),
      titleMatch: "",
      authorMatch: archive.authorMatch,
      parts,
    });
  }

  // Added here, unlike the other seven generators: this check was missing
  // entirely (see `assertNoDuplicateIds`'s own comment). MIA has one work
  // per author today, so the gap was never visible in practice.
  assertNoDuplicateIds(works);
  console.log(
    `\n${works.length} verk, ${works.reduce((n, w) => n + (w.parts?.length ?? 0), 0)} artiklar totalt`,
  );

  writeManifest(OUT_PATH, works, dry);
  console.log("Kör `pnpm ingest` för att indexera.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
