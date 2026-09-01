import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "./db";
import { htmlToText } from "./html";
import type { CanonWork } from "./corpus";

const START_RE = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;
const END_RE = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;

export function textUrl(gutenbergId: string): string {
  return `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`;
}

/**
 * Fetches the raw text, with a disk cache so a re-run doesn't hit Gutenberg again.
 */
export async function fetchRaw(work: CanonWork): Promise<string> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, `pg${work.sourceId}.txt`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");

  // We fetch close to 500 files from gutenberg.org. The disk cache makes
  // that happen only once, but a pause between fetches is reasonable
  // courtesy toward a free service that asks nothing in return.
  await new Promise((r) => setTimeout(r, 1000));

  const res = await fetch(textUrl(work.sourceId), {
    headers: { "User-Agent": "canon-indexer/0.1 (personal research project)" },
  });
  let body: string;
  if (res.ok) {
    body = await res.text();
  } else if (res.status === 404) {
    body = await fetchHtmlFallback(work.sourceId);
  } else {
    throw new Error(`Gutenberg ${work.sourceId} svarade ${res.status} ${res.statusText}`);
  }
  fs.writeFileSync(cached, body, "utf8");
  return body;
}

/**
 * PG 75107 (Lovelace's "Note G") answers 404 on .txt — the book exists only
 * as HTML, epub and mobi. This is not a broken link but how Gutenberg now
 * distributes some newer additions, so the .txt fetch needs a fallback path
 * instead of assuming a 404 means a bad ID.
 *
 * The HTML edition carries the same "*** START/END OF THE PROJECT GUTENBERG
 * EBOOK ***" markers as .txt, so `stripBoilerplate` below works unchanged on
 * the result of `htmlToText` (the same function Runeberg and MIA run their
 * HTML sources through). The `<title>` tag's text ("X | Project Gutenberg")
 * replaces the "Title:" line `verifyHeader` otherwise reads from the .txt
 * header — the HTML header lacks an "Author:" line entirely, which is only
 * harmless as long as the manifest's `authorMatch` is empty, as it is for
 * the EXTRA list's posthumously attributed works. A work with a real
 * `authorMatch` that takes this path would fail the author check instead of
 * silently passing it.
 */
async function fetchHtmlFallback(sourceId: string): Promise<string> {
  const url = `https://www.gutenberg.org/cache/epub/${sourceId}/pg${sourceId}-images.html`;
  const res = await fetch(url, {
    headers: { "User-Agent": "canon-indexer/0.1 (personal research project)" },
  });
  if (!res.ok) {
    throw new Error(
      `Gutenberg ${sourceId} svarade ${res.status} ${res.statusText} (varken .txt eller .html)`,
    );
  }
  const html = await res.text();
  const title = /<title>([^<|]*)/i.exec(html)?.[1]?.trim() ?? "";
  return `Title: ${title}\nAuthor:\n\n${htmlToText(html)}`;
}

/**
 * Folds a name to ASCII so the expectation and the file header are spelled the same way.
 *
 * The manifest's `authorMatch` is built from the catalogue and tested
 * against the file, and the two don't write diacritics the same way: the
 * catalogue's names are slugified to ASCII while the header keeps "Camões,"
 * "Bjørnson," "Pérez Galdós." The check therefore said PG 32528 had the
 * "wrong" author — "luís de camões" doesn't contain "camoes" — and fifteen
 * works had been rejected over an accent. The same kind of bug as Perseus's
 * "Appianus" versus "Appian," just in the other direction.
 *
 * The folding is done on BOTH sides, so the check is exactly as strict as
 * before: it still requires the surname to appear in the header. It just
 * stops requiring it to be spelled with the same characters. NFD alone isn't
 * enough — ø, æ, ð and ł have no combining form to strip, so they have to be
 * substituted individually.
 */
export function foldName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/ł/g, "l")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Checks that the ID actually points to the work the manifest claims.
 * Gutenberg IDs can be redirected to a different edition; a silent bug here
 * poisons the whole index, so this throws rather than warns.
 */
export function verifyHeader(raw: string, work: CanonWork): void {
  const header = raw.slice(0, 3000).replace(/\r/g, "").toLowerCase();
  // [ \t]* (not \s*): on the HTML fallback's empty "Author:" line (see
  // fetchHtmlFallback), \s* would jump across the line break and pick up the
  // next paragraph's text as the author — the embedded title that leaked in
  // via htmlToText. Keeping the capture on the label's own line instead
  // makes it skip ahead to PG's own "Author:" line further down in the same
  // HTML, which exists and is correct.
  const title = /^title:[ \t]*(.+)$/m.exec(header)?.[1]?.trim() ?? "";
  // A co-author continues on an indented line with no label of its own —
  // Principia Mathematica's header reads "Author: Alfred North Whitehead\n
  // Bertrand Russell". A capture limited to the first line only saw
  // Whitehead and rejected the work, even though Russell was on the line below.
  const author =
    /^author:[ \t]*(.+(?:\n[ \t]+\S.*)*)/m
      .exec(header)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? "";

  if (!title.includes(work.titleMatch)) {
    throw new Error(
      `Fel utgåva för ${work.id}: PG ${work.sourceId} har titeln "${title}", ` +
        `förväntade något som innehåller "${work.titleMatch}".`,
    );
  }
  if (!foldName(author).includes(foldName(work.authorMatch))) {
    throw new Error(
      `Fel utgåva för ${work.id}: PG ${work.sourceId} har författaren "${author}", ` +
        `förväntade något som innehåller "${work.authorMatch}".`,
    );
  }
}

/**
 * Strips Gutenberg's license header and footer. Character offsets in the
 * database point into what's returned here, so this string is the one
 * saved to disk.
 */
export function stripBoilerplate(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const start = START_RE.exec(text);
  if (start) text = text.slice(start.index + start[0].length);

  const end = END_RE.exec(text);
  if (end) text = text.slice(0, end.index);

  // Normalize whitespace without destroying paragraph boundaries (blank lines).
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
