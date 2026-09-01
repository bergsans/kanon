/**
 * Text retrieval from the Text Creation Partnership (EEBO-, ECCO- and Evans-TCP).
 *
 * TCP is the only source in the collection that gives English print 1473–1700 in
 * its *first edition*: Leviathan as it was printed in 1651, Paradise Lost in ten
 * books in 1667, Milton's polemical tracts in their own typography, Harrington,
 * Filmer, Winstanley, Bacon, Browne, Cudworth. Gutenberg has some of the same
 * works, but in 19th-century editions with normalized spelling and sometimes
 * punctuation. These are two different texts, and the difference is the whole
 * reason to carry both.
 *
 * THE TEXTS ARE HAND-TRANSCRIBED, not OCR'd. That's the decisive difference from
 * Internet Archive and HathiTrust, whose 17th-century material is machine-read
 * and thus unusable for the same reason as Runeberg's unreadable pages.
 *
 * THE RIGHTS ARE CC0, AND THE CATALOG'S `Status` LIES. `TCP.csv` marks 32,853
 * texts `Free` and 28,462 `Restricted`, which looks like a rights boundary. It
 * isn't — the column is a leftover from the publication phases. Read
 * `<availability>` in the files and both groups say CC0, and the `Restricted`
 * ones say it more plainly of the two:
 *
 *   Free:        "This Phase I text is available for reuse, according to the
 *                 terms of Creative Commons 0 1.0 Universal."
 *   Restricted:  "To the extent possible under law, the Text Creation Partnership
 *                 has waived all copyright and related or neighboring rights …
 *                 according to the terms of the CC0 1.0 Public Domain Dedication"
 *
 * Measured on twenty randomly sampled texts, fourteen `Free` and six
 * `Restricted`: all twenty carry a CC0 statement, and all twenty are fetchable.
 * The check therefore reads the file's own line and ignores the catalog column.
 * That the works *themselves* are free follows from their being printed before
 * 1700 — there's no translation here with its own separate copyright term to
 * track, as with Perseus.
 *
 * LONG S HAS TO GO, AND THAT'S MEASURED. Roughly half the texts set ſ instead of
 * s — the distribution is bimodal, either zero or 105–172 occurrences per
 * thousand words, never in between. BM25 never matches "first" against "firſt",
 * and if the character is left in, half the collection is invisible to the
 * keyword branch. The normalization is purely typographic and loses nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "./db";
import { decodeEntities } from "./html";
import { tagText } from "./tei";
import type { CanonWork } from "./corpus";

const RAW_BASE = "https://raw.githubusercontent.com/textcreationpartnership";

/** The rights line. Both TCP wordings, see the file header. */
const CC0 =
  /creativecommons\.org\/publicdomain\/zero|creative commons 0 1\.0|cc0 1\.0 public domain/i;

/**
 * Lost words per thousand a text may have and still be indexed.
 *
 * The measure counts only gaps that swallow *a whole word or more*, and that's
 * the whole point. The transcription is accurate but the source isn't always:
 * where the print is damaged, TCP inserts `<gap reason="illegible"/>`. Measured
 * over 42,351 gaps in 258 texts, the distribution is far from even:
 *
 *   85.3%   one or a few letters   "common ardo…r of contention"
 *   11.5%   one word
 *    1.4%   a line, a paragraph, a page
 *
 * A missing letter is cosmetic — the reader still sees "ardour", and only that
 * one word drops out of BM25. A missing page is something else. Counted over all
 * gaps, *Religio Medici* came out at 33 per thousand and looked unusable;
 * counted over lost words it's 1.09 and fully readable. The first measure was
 * the wrong thing to measure.
 *
 * Over 217 texts with at least 3,000 words: median 0.08, p90 1.65, p95 3.65, max
 * 14.9. Four sit just above p95 — the clearly readable ones get in, and only the
 * truly damaged sources fall out.
 */
export const MAX_LOST_WORDS_PER_1000 = 4;

/** Gaps whose `extent` says a whole word or more is missing. */
const LOST_WORD = /word|line|page|para|span/i;

/**
 * Div types that are the physical book, not the work as text.
 *
 * Deliberately short. `dedication` and `introduction` are *not* here, and that's
 * the same lesson chunking carries about Spinoza's PREFACE: Leviathan's
 * `<div type="introduction">` is Hobbes's own introduction and part of the work.
 * Dropping it based on the type would mean dropping the text. What's listed here
 * is stuff that isn't text at all — coats of arms, engraved title pages — or
 * pure navigation. Everything else is left to chunking's own front-matter rule.
 */
const APPARATUS_DIV =
  /^(title_page|engraved_title_page|coat_of_arms|frontispiece|table_of_contents|errata|colophon|bookplate|blank|advertisement|publishers_advertisement|index|imprimatur|license|subscribers)$/i;

/** Div types that are a citation step worth writing into the reference. */
const CITED_DIV =
  /^(book|part|chapter|section|canto|act|scene|letter|sermon|dialogue)$/i;

/** Tags whose content is never the work's text. */
const DROP = /^(note|figure|figDesc|fw|teiHeader|desc|ref|bibl)$/i;

/** Tags that end a paragraph. */
const BLOCK =
  /^(p|ab|lg|sp|speaker|stage|item|label|list|trailer|closer|opener|salute|signed|argument|table|row|cell|q|quote|epigraph|byline|docTitle|titlePart)$/i;

export interface TcpHeader {
  title: string | null;
  author: string | null;
  /** The edition's print year from `editionStmt`, otherwise the first year in the header. */
  year: number | null;
  availability: string | null;
}

/** Fetches the TEI file, with a disk cache. One GitHub repo per text. */
export async function fetchRaw(work: CanonWork): Promise<string> {
  const id = work.sourceId;
  const cacheDir = path.join(CACHE_DIR, "tcp");
  fs.mkdirSync(cacheDir, { recursive: true });
  const cached = path.join(
    cacheDir,
    `${id.replace(/[^a-z0-9._-]+/gi, "_")}.xml`,
  );
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");

  const res = await fetch(`${RAW_BASE}/${id}/master/${id}.xml`, {
    headers: { "User-Agent": "canon-indexer/0.1 (personal research project)" },
  });
  if (!res.ok)
    throw new Error(`TCP ${id} svarade ${res.status} ${res.statusText}`);
  const body = await res.text();
  fs.writeFileSync(cached, body, "utf8");
  return body;
}

export function parseHeader(raw: string): TcpHeader {
  const head = raw.slice(0, Math.max(raw.indexOf("</teiHeader>"), 0) || 12_000);
  const availability = tagText(head, "availability");
  const edition =
    /<editionStmt\b[\s\S]*?<\/editionStmt>/i.exec(head)?.[0] ?? "";
  const year =
    /<date\b[^>]*>\s*(\d{4})/i.exec(edition)?.[1] ??
    /<date\b[^>]*when="(\d{4})/i.exec(head)?.[1] ??
    null;

  return {
    title: tagText(head, "title"),
    author: tagText(head, "author"),
    year: year ? Number(year) : null,
    availability,
  };
}

/**
 * Checks that the ID points to the work the manifest claims, and that the file
 * itself dedicates the transcription to the public domain.
 *
 * Done here and not just in the generator: the manifest is a file that can be
 * edited, and this is the line that stands in the way when a text is actually
 * fetched.
 */
export function verifyHeader(raw: string, work: CanonWork): void {
  const head = parseHeader(raw);

  if (!head.availability || !CC0.test(head.availability)) {
    throw new Error(
      `${work.id}: TCP anger rättigheterna som "${(head.availability ?? "(saknas)").slice(0, 90)}" ` +
        `— bara texter med CC0-dedikation får indexeras.`,
    );
  }

  const title = (head.title ?? "").toLowerCase();
  const author = (head.author ?? "").toLowerCase();

  if (work.titleMatch && !title.includes(work.titleMatch)) {
    throw new Error(
      `Fel utgåva för ${work.id}: ${work.sourceId} har titeln "${(head.title ?? "").slice(0, 60)}", ` +
        `förväntade något som innehåller "${work.titleMatch}".`,
    );
  }
  if (work.authorMatch && !author.includes(work.authorMatch)) {
    throw new Error(
      `Fel utgåva för ${work.id}: ${work.sourceId} har författaren "${head.author}", ` +
        `förväntade något som innehåller "${work.authorMatch}".`,
    );
  }
}

/**
 * Typographic normalization.
 *
 * Only characters that are the same letter in a different cut. Spelling is left
 * alone — "principiles", "morall", "sonne" should stay exactly as printed, since
 * that's the work's text. Long s, however, is not a spelling but a typeface
 * variant, and if left in, the keyword branch never matches half the collection.
 */
function normalizeTypography(s: string): string {
  return s
    .replace(/[ſẛ]/g, "s")
    .replace(/ﬀ/g, "ff")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl");
}

interface Segment {
  path: [string, string][];
  head: string | null;
  paragraphs: string[];
}

export interface TcpText {
  text: string;
  /** All `<gap>` in the body text, regardless of extent. Reported, doesn't gate. */
  gaps: number;
  /** The gaps that swallow a word or more — the measure that gates. */
  lostWords: number;
  words: number;
}

/**
 * TEI → segments.
 *
 * A hand-rolled pass instead of an XML parser, for the same reason as in
 * `perseus.ts`: the repo has no parser among its dependencies, and what needs to
 * be understood is a handful of things that need their own handling anyway —
 * end-of-line hyphens, gaps, marginal notes, and div nesting.
 */
function parseBody(raw: string): {
  segments: Segment[];
  gaps: number;
  lostWords: number;
} {
  const start = raw.search(/<body\b/i);
  const end = raw.lastIndexOf("</body>");
  if (start === -1 || end === -1)
    return { segments: [], gaps: 0, lostWords: 0 };
  const body = raw.slice(raw.indexOf(">", start) + 1, end);

  const segments: Segment[] = [];
  const divs: [string, string][] = [];
  /** Number of citation steps each open div added; `FRONT` = apparatus. */
  const divSteps: number[] = [];
  const FRONT = -1;

  let buffer = "";
  let dropDepth = 0;
  let dropTag = "";
  let frontDepth = 0;
  let pendingHead: string | null = null;
  let gaps = 0;
  let lostWords = 0;
  /**
   * How many sections of a given type have been seen under a given parent, so an
   * unnumbered section can be assigned an ordinal. The key carries the parent:
   * chapter 1 in book II should become 1 again, not continue the count from book
   * I.
   */
  const siblings = new Map<string, number>();

  const flushParagraph = () => {
    const text = buffer
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
    buffer = "";
    if (text.length === 0) return;
    segments.push({
      path: divs.map((d) => [...d] as [string, string]),
      head: pendingHead,
      paragraphs: [text],
    });
    pendingHead = null;
  };

  const tokens = body.matchAll(
    /<\/?([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\/?>|([^<]+)/g,
  );

  for (const tok of tokens) {
    const [whole, name, attrs = "", text] = tok;

    if (text !== undefined) {
      if (dropDepth === 0 && frontDepth === 0) buffer += decodeEntities(text);
      continue;
    }

    const closing = whole.startsWith("</");
    const selfClosing = whole.endsWith("/>");
    const tag = name.replace(/^[a-z]+:/i, "");

    if (dropDepth > 0) {
      if (closing && tag.toLowerCase() === dropTag) dropDepth--;
      else if (!closing && !selfClosing && tag.toLowerCase() === dropTag)
        dropDepth++;
      continue;
    }

    // End-of-line hyphen. TCP marks it as its own character, and it must be
    // removed without leaving a space: `be<g ref="char:EOLhyphen"/>gining` is the
    // word "begining". Miss it and roughly one word in fifty breaks — Leviathan
    // has 4,333 of them.
    //
    // `<g>` carries no text of its own either way — closing, self-closing, or
    // an EOL-hyphen marker all just drop the tag and move on, which is why
    // this was `continue` on every path even before the dead conditional
    // around it was removed.
    if (/^g$/i.test(tag)) continue;

    // Illegible in the source. Marked visibly rather than silently dropped: a
    // word that quietly becomes "Strgs" is an error the reader can't see, and
    // that's exactly the kind of error the rest of the app is built to avoid.
    if (/^gap$/i.test(tag)) {
      if (!closing) {
        gaps++;
        // `extent` says how much is missing. Only word-and-larger counts as a
        // lost clause — see `MAX_LOST_WORDS_PER_1000`.
        if (LOST_WORD.test(/\bextent="([^"]*)"/i.exec(attrs)?.[1] ?? ""))
          lostWords++;
        if (frontDepth === 0) buffer += "…";
        if (!selfClosing) {
          dropDepth = 1;
          dropTag = "gap";
        }
      }
      continue;
    }

    if (!closing && DROP.test(tag)) {
      if (!selfClosing) {
        dropDepth = 1;
        dropTag = tag.toLowerCase();
      }
      continue;
    }

    if (/^div\d?$/i.test(tag)) {
      if (closing) {
        flushParagraph();
        const steps = divSteps.pop() ?? 0;
        if (steps === FRONT) frontDepth--;
        else divs.length -= Math.min(steps, divs.length);
        continue;
      }
      if (selfClosing) continue;

      flushParagraph();
      const n = /\bn="([^"]*)"/i.exec(attrs)?.[1] ?? "";
      const type = /\btype="([^"]*)"/i.exec(attrs)?.[1] ?? "";

      if (frontDepth > 0 || APPARATUS_DIV.test(type)) {
        frontDepth++;
        divSteps.push(FRONT);
        continue;
      }
      if (CITED_DIV.test(type)) {
        // The source doesn't always number its first section: Religio Medici has
        // `<div type="part">` without `n`, followed by `<div n="2" type="part">`,
        // because the print just wrote out "The Second part". Without a number,
        // part one gets no heading at all, and chunking then counts the whole
        // first part as front matter — 109 of 155 passages disappeared from the
        // search on exactly that. Counting siblings instead gives the implicit
        // first one its 1.
        const scope = `${divs.map(([u, v]) => `${u}=${v}`).join("/")}|${type.toLowerCase()}`;
        const next = (siblings.get(scope) ?? 0) + 1;
        siblings.set(scope, next);
        divs.push([type, n || String(next)]);
        divSteps.push(1);
      } else {
        divSteps.push(0);
      }
      continue;
    }

    if (/^head$/i.test(tag)) {
      if (closing) {
        const head = buffer.replace(/\s+/g, " ").trim();
        buffer = "";
        if (frontDepth === 0) pendingHead = head || null;
      } else {
        flushParagraph();
      }
      continue;
    }

    // Drop caps sit in their own tag: `<seg rend="decorInit">N</seg>ATURE` is the
    // word "NATURE". The content should join in, with no space around it.
    if (/^seg$/i.test(tag)) continue;

    if (/^(hi|emph)$/i.test(tag)) {
      buffer += "_";
      continue;
    }

    if (BLOCK.test(tag)) {
      if (/^(l|speaker|stage)$/i.test(tag) && closing) buffer += "\n";
      else flushParagraph();
      continue;
    }
    if (/^l$/i.test(tag) && closing) {
      buffer += "\n";
      continue;
    }
  }
  flushParagraph();

  return {
    segments: segments.filter((s) => s.paragraphs.length > 0),
    gaps,
    lostWords,
  };
}

/** "chapter" + "13" → "CHAPTER 13". */
function unitLabel(unit: string, n: string): string {
  return `${unit.replace(/[_-]+/g, " ").toUpperCase()} ${n.toUpperCase()}`.trim();
}

/**
 * The heading, minus what the reference already says.
 *
 * TCP's headings are the source's own and often carry their own chapter number —
 * "CHAP. XIII. Of the NATURALL CONDITION of Mankind". If the structure is already
 * in the line, it would become "CHAPTER 13 — CHAP. XIII. …", so the number is
 * stripped off and what's left is what the heading actually contributes.
 */
function trimHead(head: string): string {
  return (
    head
      // Italic markers belong to the body text, not to a reference: the source
      // italicizes half the heading ("_Of_ Sense"), and `emphasis.tsx` only reads
      // them when rendering a passage. In the locator they'd just be clutter.
      .replace(/_/g, "")
      .replace(
        /^\s*(chap(ter)?|book|sect(ion)?|part)\b\.?\s*[ivxlcdm\d]*\.?\s*/i,
        "",
      )
      .replace(/^[.\s—–-]+/, "")
      .trim()
  );
}

/**
 * A heading with no structural prefix must fit within chunking's eight-word limit.
 *
 * `looksLikeHeading` accepts a long all-caps line only if it *starts* with a
 * keyword — "BOOK", "CHAPTER". If a work has no numbered structure, there's no
 * such prefix to set, and Alexander Ross's fourteen-word chapter headings were
 * then read as body text: 157 passages, zero references. Trimmed to eight words,
 * the line is recognized, and what's dropped is the subheading's enumeration.
 */
function fitBareHead(head: string): string {
  const words = head.split(/\s+/).filter(Boolean);
  return words.length <= 8 ? head : words.slice(0, 8).join(" ") + "…";
}

function render(segments: Segment[], gaps: number, lostWords: number): TcpText {
  const out: string[] = [];
  let previous = "";

  for (const segment of segments) {
    const key = segment.path.map(([u, n]) => `${u}=${n}`).join("/");
    const head = segment.head ? trimHead(segment.head).toUpperCase() : "";

    if ((key !== previous && key !== "") || head) {
      previous = key;
      const cite = segment.path.map(([u, n]) => unitLabel(u, n)).join(", ");
      const line =
        cite && head ? `${cite} — ${head}` : cite || fitBareHead(head);
      // The heading must stay under chunking's `MAX_HEADING_LEN`, otherwise it's
      // read as body text and the passage ends up without a reference.
      if (line)
        out.push(
          line.length <= 88
            ? line
            : line.slice(0, 85).replace(/\s\S*$/, "") + "…",
        );
    }
    out.push(...segment.paragraphs);
  }

  const text = normalizeTypography(out.join("\n\n"))
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text,
    gaps,
    lostWords,
    words: (text.match(/[A-Za-z']+/g) ?? []).length,
  };
}

/** TEI → text, with the quality measures. `.probe-tcp.ts` and the generator read them. */
export function toTcpText(raw: string, work: CanonWork): TcpText {
  const { segments, gaps, lostWords } = parseBody(raw);
  if (segments.length === 0) {
    throw new Error(
      `${work.id}: ${work.sourceId} har ingen brödtext att indexera.`,
    );
  }
  return render(segments, gaps, lostWords);
}

/**
 * The text ingest saves and chunks.
 *
 * The quality threshold lives here and not just in the generator, for the same
 * reason as the rights check: the manifest can be hand-edited.
 */
export function toText(raw: string, work: CanonWork): string {
  const { text, lostWords, words } = toTcpText(raw, work);
  const density = words > 0 ? (lostWords / words) * 1000 : 0;
  if (density > MAX_LOST_WORDS_PER_1000) {
    throw new Error(
      `${work.id}: ${density.toFixed(1)} förlorade ord per 1000 — över gränsen ` +
        `${MAX_LOST_WORDS_PER_1000}. Förlagan är för skadad för att indexeras.`,
    );
  }
  return text;
}
