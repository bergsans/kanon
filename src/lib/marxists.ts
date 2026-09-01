/**
 * Text retrieval from Marxists Internet Archive.
 *
 * MIA is the only collection covering the classics of the labor movement and
 * Western Marxism — Gramsci doesn't exist at Gutenberg at all — but it's
 * also the most sensitive of the collection's sources, since it holds texts
 * under wildly different rights within the same catalogue.
 *
 * THE ARCHIVE ITSELF IS NOT A LICENSE. MIA publishes three kinds of text
 * side by side: works that are free due to their age, translations MIA
 * commissioned themselves and released under Creative Commons, and texts
 * they host on a fair-use claim without owning the rights. The difference
 * doesn't show in the URL and doesn't show in the appearance. Their Gramsci
 * page describes what happens when the line is crossed: in 2008 Lawrence &
 * Wishart demanded Quintin Hoare's translations be taken down, and all
 * that's left are the translations MIA had made themselves.
 *
 * So only texts that state outright where the translation came from are
 * indexed. Every article carries a provenance block:
 *
 *   <p class="information">
 *     Source: L'Ordine Nuovo, 11 October 1919;
 *     Translated: for the Marxists Internet Archive by Michael Carley.
 *   </p>
 *
 * "for MIA" or an explicit CopyLeft line is accepted; everything else is
 * skipped, even when the text sits in the middle of an archive where the
 * rest is free. This is deliberately strict: the original's age doesn't
 * decide the translation's rights.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "./db";
import { htmlToText, stripTags } from "./html";
import type { CanonWork } from "./corpus";

const BASE = "https://www.marxists.org";

/** MIA's robots.txt asks for one second between fetches. */
const CRAWL_DELAY_MS = 1100;

/**
 * Provenance lines meaning MIA owns or has been granted the right to
 * distribute the translation. See the module comment — everything else
 * isn't forbidden, it's just unproven, and the difference can't be settled
 * from a text page.
 */
const LICENSED =
  /copyleft\s*:[^;]*creative commons|translat\w*\s*:[^;]*\bfor (?:mia|the marxists internet archive|marxists\.org)\b/i;

export function pageUrl(pathname: string): string {
  return `${BASE}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}

/** Fetches a page, with a disk cache so a re-run doesn't hit MIA again. */
export async function fetchPage(pathname: string): Promise<string> {
  const cacheDir = path.join(CACHE_DIR, "mia");
  fs.mkdirSync(cacheDir, { recursive: true });
  const cached = path.join(
    cacheDir,
    pathname.replace(/[^a-z0-9]+/gi, "_") + ".html",
  );
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");

  await new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
  const res = await fetch(pageUrl(pathname), {
    headers: { "User-Agent": "canon-indexer/0.1 (personal research project)" },
  });
  if (!res.ok)
    throw new Error(`MIA ${pathname} svarade ${res.status} ${res.statusText}`);
  const body = await res.text();
  fs.writeFileSync(cached, body, "utf8");
  return body;
}

export interface Article {
  title: string;
  /** The provenance block, verbatim — so a selection can be audited afterwards. */
  provenance: string;
  licensed: boolean;
  text: string;
}

/**
 * Takes an article page apart.
 *
 * The pages are simply and consistently marked up: <h3> for the title,
 * <p class="information"> for the provenance, <p class="footer"> for the
 * navigation. The latter has to go — otherwise "Antonio Gramsci Archive"
 * ends up in the body text.
 */
export function parseArticle(html: string): Article {
  const title =
    stripTags(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(html)?.[1] ?? "") ||
    stripTags(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");

  const provenance = stripTags(
    /<p class="information">([\s\S]*?)<\/p>/i.exec(html)?.[1] ?? "",
  );

  const body = html
    .replace(/[\s\S]*?<\/head>/i, "")
    .replace(
      /<p class="(?:title|information|footer|skip|updat)"[\s\S]*?<\/p>/gi,
      "",
    )
    .replace(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/gi, "");

  return {
    title,
    provenance,
    licensed: LICENSED.test(provenance),
    text: htmlToText(body),
  };
}

/**
 * Assembles the work's parts into one text.
 *
 * A "work" here is a collection of articles — MIA publishes Gramsci's
 * political writings as fifty separate pages, and fifty one-passage manifest
 * entries would be a list, not a collection. Each article's title becomes a
 * heading, and thereby the passage's reference in the UI.
 */
export async function fetchWorkText(work: CanonWork): Promise<string> {
  const parts = work.parts ?? [];
  if (parts.length === 0) {
    throw new Error(`${work.id}: manifestet listar inga delar att hämta.`);
  }

  const sections: string[] = [];
  const skipped: string[] = [];

  for (const part of parts) {
    const article = parseArticle(await fetchPage(part));
    // The check is redone here and not just in the generator: the manifest
    // is a file that can be edited, and this line is what actually keeps a
    // protected translation from reaching the index.
    if (!article.licensed) {
      skipped.push(part);
      continue;
    }
    if (article.text.length < 200) continue;
    sections.push(`${article.title.toUpperCase()}\n\n${article.text}`);
  }

  if (skipped.length > 0) {
    console.warn(
      `  ⚠ ${skipped.length} av ${parts.length} delar hoppades över — ingen belagd ` +
        `licens: ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? " …" : ""}`,
    );
  }
  if (sections.length === 0) {
    throw new Error(`${work.id}: ingen av delarna hade en belagd licens.`);
  }
  return sections.join("\n\n");
}

/** Checks that the archive still concerns the author the manifest claims. */
export async function verifyWork(work: CanonWork): Promise<void> {
  const html = await fetchPage(work.sourceId);
  const text = stripTags(html).toLowerCase();
  if (work.authorMatch && !text.slice(0, 400).includes(work.authorMatch)) {
    throw new Error(
      `Fel arkiv för ${work.id}: ${work.sourceId} nämner inte "${work.authorMatch}" i sitt huvud.`,
    );
  }
}
