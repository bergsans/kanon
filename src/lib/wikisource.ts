/**
 * Text retrieval from Wikisource.
 *
 * This source was added for Joseph de Maistre, and the reason is worth
 * writing down: he doesn't exist in any of the collection's seven other
 * sources. Gutenberg's catalogue has, under "maistre," only his brother
 * Xavier and John Morley's essay *about* him; TCP stops at 1700; DTA is
 * German; Perseus is antiquity; and the Swedish archives are Swedish. A
 * collection that has Rousseau, Burke and Tocqueville but no
 * counter-revolutionary is not a selection but a gap — and it couldn't be
 * filled without an eighth source.
 *
 * WIKISOURCE IS A WIKI, and that difference governs everything below. The
 * other archives publish an edition: the file is someone's editorial work,
 * and the ID points at it. Here the text is written by volunteers, may be
 * half-finished, and carries its own quality rating. Three checks follow from
 * that, and they are independent of each other:
 *
 *   1. THE ORIGINAL is free. The author's year of death is in the manifest
 *      and tested against `PROTECTION_YEARS`. Same check and same number as
 *      the MIA module.
 *
 *   2. NO TRANSLATION. The page header marks a translation machine-readably,
 *      with `itemprop="translator"`, and a translation has its own seventy
 *      years from the translator's death — a date the page doesn't provide.
 *      So only texts in the author's own language are taken. This is the MIA
 *      module's point verbatim: the original's age doesn't decide the
 *      translation's rights.
 *
 *   3. PROOFREAD. The page sits in a percentage category — fr.wikisource sets
 *      75% when the text has been checked against the facsimile and 25% when
 *      it's only been transcribed. The difference is not cosmetic, measured
 *      on the four de Maistre works that existed: *Les Soirées de
 *      Saint-Pétersbourg* sits at 25% and is 15k characters where the printed
 *      edition is eleven dialogues — that is, an unfinished work that looks
 *      complete in a result list. *Considérations sur la France* and
 *      *Lettres sur l'inquisition espagnole* sit at 75% and are complete.
 *      This is the Runeberg lesson in new form: a text that looks like French
 *      without being the finished text should be rejected, not indexed.
 *
 * A page without a percentage category is not rejected — the transcluded
 * chapters in *De l'Église gallicane* have none at all, even though the book
 * is scanned and proofread in the Page namespace. The generator counts them
 * separately in its report, so the difference between "approved" and
 * "unrated" shows up instead of being smoothed over.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "./db";
import { htmlToText, stripTags } from "./html";
import type { CanonWork, Language } from "./corpus";

/** The protection term in Sweden and the EU: the author's lifetime plus seventy years. */
export const PROTECTION_YEARS = 70;

/**
 * The lowest proofreading grade that's good enough.
 *
 * fr.wikisource has four steps, and 75% is where a human has compared the
 * text against the facsimile page by page. Below that sits 25%, "texte non
 * corrigé," which is raw transcription or OCR. See the module comment for
 * what the two steps meant for de Maistre: a whole work versus an unfinished one.
 */
export const MIN_QUALITY = 75;

/**
 * Delay between fetches, and it is measured, not guessed.
 *
 * Half a second was the first choice — Wikimedia publishes no rate limit,
 * only a request for serial calls and a contactable user agent. That wasn't
 * enough: *Considérations sur la France* is thirteen pages, and at 500 ms the
 * API answered 429 Too Many Requests starting from the ninth. At 1,100 ms all
 * thirteen went through. Same number the MIA module uses, for the same reason.
 */
const CRAWL_DELAY_MS = 1100;

/**
 * Retries on a 429.
 *
 * A rejection here is not a verdict on the page but on the pace, and that
 * difference is the whole point: the generator records which parts a work
 * consists of, and a part that fell to a transient 429 would become a
 * permanent hole in the middle of a book. The wait doubles, and `Retry-After`
 * takes precedence when the server provides one.
 */
const RETRIES = 4;

export function siteUrl(language: Language): string {
  return `https://${language}.wikisource.org`;
}

/** The address of the page, as it's written for a reader. */
export function pageUrl(language: Language, title: string): string {
  return `${siteUrl(language)}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

interface ParseResult {
  title: string;
  html: string;
  categories: string[];
}

/**
 * Fetches a page through the API rather than as HTML.
 *
 * `action=parse` gives the rendered text without the surrounding chrome — no
 * menu, no footer, no scripts — and the categories in the same response.
 * Scraping the reading view would have meant a change to Wikimedia's
 * appearance becoming a bug in the collection. The response is cached to
 * disk: a re-run of the generator shouldn't fetch forty chapters all over again.
 */
export async function fetchParse(
  language: Language,
  title: string,
): Promise<ParseResult> {
  const cacheDir = path.join(CACHE_DIR, "wikisource", language);
  fs.mkdirSync(cacheDir, { recursive: true });
  const key = title.replace(/[^a-z0-9]+/gi, "_").slice(0, 120);
  const cached = path.join(cacheDir, `${key}.json`);

  let body: string;
  if (fs.existsSync(cached)) {
    body = fs.readFileSync(cached, "utf8");
  } else {
    const url =
      `${siteUrl(language)}/w/api.php?action=parse&format=json&formatversion=2` +
      `&redirects=1&prop=text%7Ccategories&page=${encodeURIComponent(title)}`;

    let wait = CRAWL_DELAY_MS;
    let res: Response | null = null;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      await new Promise((r) => setTimeout(r, wait));
      res = await fetch(url, {
        headers: {
          "User-Agent": "canon-indexer/0.2 (personal research project)",
        },
      });
      if (res.status !== 429) break;
      const after = Number(res.headers.get("retry-after"));
      wait = Number.isFinite(after) && after > 0 ? after * 1000 : wait * 2;
    }
    if (!res || !res.ok) {
      throw new Error(
        `Wikisource ${title} svarade ${res?.status ?? "inget"} ${res?.statusText ?? ""}`.trim(),
      );
    }
    body = await res.text();
    fs.writeFileSync(cached, body, "utf8");
  }

  const json = JSON.parse(body) as {
    error?: { code: string; info: string };
    parse?: {
      title: string;
      text: string;
      categories?: { category: string }[];
    };
  };
  if (json.error) throw new Error(`Wikisource ${title}: ${json.error.info}`);
  if (!json.parse) throw new Error(`Wikisource ${title}: tomt svar`);

  return {
    title: json.parse.title,
    html: json.parse.text,
    categories: (json.parse.categories ?? []).map((c) => c.category),
  };
}

export interface Page {
  /** The page's title at Wikisource, after redirection. */
  title: string;
  /** The author as the page header itself states it. Empty when the header is missing. */
  author: string;
  /** The work this page is a chapter of, when it is one. */
  partOf: string | null;
  /** The translator, when the header names one. See check 2 in the module comment. */
  translator: string | null;
  /** The proofreading grade in percent. `null` when the page has no category. */
  quality: number | null;
  /** The body text. */
  text: string;
}

/** The content of `<span itemprop="X"><span itemprop="name">…` in the page header. */
function itemprop(html: string, prop: string): string | null {
  const block = new RegExp(
    `<span[^>]*itemprop="${prop}"[\\s\\S]{0,400}?itemprop="name"[^>]*>([\\s\\S]*?)</span>`,
    "i",
  ).exec(html);
  const value = block ? stripTags(block[1]) : "";
  return value || null;
}

/**
 * Removes a block and everything inside it, with counted nesting.
 *
 * A regular expression can't pair a `<div>` with its correct `</div>`, and
 * the page header contains four nested levels. Without the count, a
 * non-greedy match removes too little (the first `</div>`) and a greedy one
 * removes the whole document.
 */
function removeBlocks(html: string, opening: RegExp): string {
  const tag = /<div\b|<\/div>/gi;
  let out = "";
  let from = 0;
  for (;;) {
    opening.lastIndex = from;
    const start = opening.exec(html);
    if (!start) return out + html.slice(from);

    out += html.slice(from, start.index);
    tag.lastIndex = start.index + start[0].length;
    let depth = 1;
    let end = html.length;
    for (let m = tag.exec(html); m; m = tag.exec(html)) {
      depth += m[0][1] === "/" ? -1 : 1;
      if (depth === 0) {
        end = m.index + m[0].length;
        break;
      }
    }
    from = end;
  }
}

/**
 * Takes a page apart.
 *
 * Wikisource itself marks what isn't the work: `class="ws-noexport"` sits on
 * the page header, the chapter navigation and the footer, and it's the
 * archive's own instruction to whoever exports the text. Following that
 * markup instead of guessing at class names is the same choice as
 * `action=parse` above — what remains is then the body text, and it stays
 * intact even if the appearance changes.
 *
 * The page numbers from the facsimile (`<span class="pagenum">`) are removed
 * separately: they're invisible anchors in the reading view but become loose
 * digits in the middle of a sentence as plain text, and chunking reads them
 * as paragraph breaks.
 */
export function parsePage(result: ParseResult): Page {
  const { html } = result;

  const quality = result.categories
    .map((c) => /^(\d{2,3})%$/.exec(c)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number)
    .sort((a, b) => b - a)[0];

  let body = removeBlocks(html, /<div[^>]*\bws-noexport\b[^>]*>/gi);
  body = body
    .replace(
      /<span[^>]*class="[^"]*\bpagenum\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      "",
    )
    .replace(
      /<span[^>]*class="[^"]*\bmw-editsection\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      "",
    );

  return {
    title: result.title,
    author: itemprop(html, "author") ?? "",
    partOf: itemprop(html, "isPartOf"),
    translator: itemprop(html, "translator"),
    quality: quality ?? null,
    text: htmlToText(body),
  };
}

/** Fetches and parses in one step — what the callers always want. */
export async function fetchPage(
  language: Language,
  title: string,
): Promise<Page> {
  return parsePage(await fetchParse(language, title));
}

/**
 * The chapters a work consists of, in the document's order.
 *
 * The order is the whole point of reading the rendered table of contents
 * instead of asking the API for the page's links: the link list comes back
 * alphabetically sorted, and a book whose chapters are sorted as text gets IX
 * before V. Only subpages of the work itself count — a table of contents also
 * links to the author, to the facsimile, and to categories.
 */
export async function fetchParts(
  language: Language,
  title: string,
): Promise<string[]> {
  const { html } = await fetchParse(language, title);
  const prefix = `${title.replace(/ /g, "_")}/`;
  const seen: string[] = [];
  for (const m of html.matchAll(/href="\/wiki\/([^"#]+)"/g)) {
    const target = decodeURIComponent(m[1]);
    if (!target.startsWith(prefix)) continue;
    const readable = target.replace(/_/g, " ");
    if (!seen.includes(readable)) seen.push(readable);
  }
  return seen;
}

/**
 * The rights check, re-run on every indexing.
 *
 * The generator makes the same check, but the manifest is a file that can be
 * edited — and this is the line that actually keeps a protected text from
 * reaching the index. Same order as in `marxists.ts`, and for the same reason.
 */
export function verifyRights(page: Page, work: CanonWork): void {
  const free = work.year + PROTECTION_YEARS;
  if (free >= new Date().getFullYear()) {
    throw new Error(
      `${work.id}: ${work.author} dog ${work.year} och är skyddad till ${free}.`,
    );
  }
  if (page.translator) {
    throw new Error(
      `${work.id}: "${page.title}" är en översättning av ${page.translator}, ` +
        `och översättningen har egna ${PROTECTION_YEARS} år som sidan inte daterar.`,
    );
  }
  if (page.quality !== null && page.quality < MIN_QUALITY) {
    throw new Error(
      `${work.id}: "${page.title}" står på ${page.quality} % korrektur, ` +
        `under golvet ${MIN_QUALITY} %.`,
    );
  }
}

/**
 * Checks that the page is what the manifest claims.
 *
 * The expectation comes from the page's own header, not from a catalogue —
 * the same rule the Perseus module follows: a check against the catalogue
 * doesn't catch an ID pointing the wrong way, since then the catalogue
 * vouches for both sides.
 */
export function verifyHeader(page: Page, work: CanonWork): void {
  const author = page.author.toLowerCase();
  if (work.authorMatch && !author.includes(work.authorMatch)) {
    throw new Error(
      `Fel sida för ${work.id}: "${page.title}" anger ${page.author || "ingen författare"}, ` +
        `manifestet väntade "${work.authorMatch}".`,
    );
  }
  const where = `${page.title} ${page.partOf ?? ""}`.toLowerCase();
  if (work.titleMatch && !where.includes(work.titleMatch.toLowerCase())) {
    throw new Error(
      `Fel sida för ${work.id}: "${page.title}" hör inte till "${work.titleMatch}".`,
    );
  }
}

/**
 * The work's text, assembled from its parts.
 *
 * The chapter title becomes a heading and therefore the passage's reference
 * in the UI — the same device the MIA module uses for Gramsci's articles. A
 * work that lives on a single page has that page as its only part, and gets
 * no heading it didn't already have.
 */
export async function fetchWorkText(work: CanonWork): Promise<string> {
  const parts = work.parts?.length ? work.parts : [work.sourceId];
  const sections: string[] = [];

  for (const part of parts) {
    const page = await fetchPage(work.language, part);
    verifyRights(page, work);
    verifyHeader(page, work);
    if (page.text.length < 200) continue;
    sections.push(
      parts.length > 1 ? `${chapterHeading(part)}\n\n${page.text}` : page.text,
    );
  }

  if (sections.length === 0) {
    throw new Error(`${work.id}: ingen av delarna gav någon text.`);
  }
  return sections.join("\n\n");
}

/**
 * "Considérations sur la France/Chapitre II" → "CHAPITRE II".
 *
 * The uppercase is not decoration: chunking recognizes a heading by its being
 * short and standing alone in capitals, and a chapter heading in lowercase
 * passes silently as body text — the work becomes searchable but the
 * passages lack a reference.
 */
function chapterHeading(part: string): string {
  return part
    .slice(part.indexOf("/") + 1)
    .replace(/\//g, " ")
    .toUpperCase();
}
