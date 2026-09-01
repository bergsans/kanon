/**
 * Text retrieval from Deutsches Textarchiv.
 *
 * DTA is the collection's first German-language source, and the reason is in
 * README's own failure analysis. Hegel's § 548 — history as the progress of
 * freedom's self-consciousness — never surfaces in search, and the cause isn't
 * the chain but the text: Wallace translates *Geist* as "mind", and the word
 * "progress" isn't in the English wording. In German, *Fortschritt im
 * Bewußtsein der Freiheit* is literally what the question is looking for.
 * README's conclusion was that the next lever is the collection, and this is
 * that lever.
 *
 * THAT GERMAN WORKS AT ALL IS MEASURED, not assumed. The cross-encoder is the
 * only step in the chain where language could tip the outcome, and it was
 * measured with the repo's own method in `.probe-rerank-lang.ts`: the same
 * candidates ranked with the Swedish query versus the query in the passage's own
 * language, four queries, forty candidates, the same works in three language
 * garbs.
 *
 *   en (Hobbes 1843)     top-10 5.8/10   Spearman 0.649
 *   de (Wahrmund 1864)   top-10 6.0/10   Spearman 0.609
 *   fr (Zévort 1852)     top-10 4.0/10   Spearman 0.501
 *
 * German is indistinguishable from English. That measurement has a weakness
 * `.probe-rerank-native.ts` later corrected: all three were translations from
 * Greek, so French's low score could just as easily have been Zévort's
 * translator prose. Measured again on native prose, the picture changed — see
 * the French part of `scripts/build-corpus-fr.ts`.
 *
 * ACCESS. DTA sets a cookie (`verified=1`) via JavaScript and reloads the page.
 * That's a speed bump against scraping, not a rights barrier: the texts are
 * explicitly CC BY-SA, every file carries its own license line, and DTA also
 * publishes the whole collection as a dump. We set the cookie, state who we are
 * in the User-Agent, and hold a one-second gap between fetches. Same courtesy as
 * toward Gutenberg and MIA. If the bump ever becomes a barrier — as it did with
 * HathiTrust — the answer is to stop fetching, not to dig further.
 *
 * THREE THINGS IN THE TEXT MUST BE FIXED, and all three are measured on Kant's
 * *Kritik der reinen Vernunft* 1781:
 *
 *   47,108   long s (ſ)             "erſte" never matches "erste" in BM25
 *   11,897   vowel + superscript e  "kuͤnftigen" is not "künftigen"
 *    6,807   end-of-line hyphens    of 24,095 lines, 28% end mid-word
 *
 * The first two are purely typographic and lose nothing. The third is
 * structural: `<lb/>` after a hyphen should join the word back together, not
 * leave "Gleich- wohl".
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "./db";
import { decodeEntities } from "./html";
import { tagText } from "./tei";
import type { CanonWork } from "./corpus";

const BASE = "https://www.deutschestextarchiv.de";

/** DTA's robots.txt doesn't ask for a pause, but we hold the same courtesy as toward MIA. */
const CRAWL_DELAY_MS = 1100;

/**
 * The license line, in every form DTA actually uses.
 *
 * Has to be broad, and that's measured: of 271 fetched files, every single one is
 * free, but they say so five different ways. A regex that only looked for
 * "Creative Commons" rejected Hölderlin's *Hyperion* — whose line reads simply
 * "CC BY-SA 4.0" — and six works whose line says they're public domain, i.e.
 * freer than CC.
 *
 *   247   Distributed under the Creative Commons Attribution-ShareAlike 4.0 License.
 *     6   Dieses Werk ist gemeinfrei.
 *     8   Namensnennung 4.0 International (CC BY 4.0), with and without prefix
 *     3   … Attribution-ShareAlike 2.0 Generic (German) License
 *     2   Distributed under the Project Gutenberg License.
 *     2   CC BY-SA 4.0
 *     1   Dieses Werk steht unter der Lizenz „Namensnennung – Weitergabe …“
 *
 * "Namensnennung" is CC's German name for attribution, and "gemeinfrei" means
 * public domain. Anything other than these forms is rejected.
 */
export const FREE_LICENCE =
  /creativecommons\.org\/licenses|creative commons|\bcc[ -]?(by|0)\b|gemeinfrei|namensnennung|public domain|project gutenberg license/i;

export interface DtaHeader {
  title: string | null;
  author: string | null;
  /** The publisher's print year, from `sourceDesc`. */
  year: number | null;
  licence: string | null;
}

/** Fetches the TEI file, with a disk cache so a rerun doesn't hit DTA again. */
export async function fetchRaw(work: CanonWork): Promise<string> {
  const cacheDir = path.join(CACHE_DIR, "dta");
  fs.mkdirSync(cacheDir, { recursive: true });
  const cached = path.join(
    cacheDir,
    `${work.sourceId.replace(/[^a-z0-9._-]+/gi, "_")}.xml`,
  );
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");

  await new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
  const res = await fetch(`${BASE}/book/download_xml/${work.sourceId}`, {
    headers: {
      "User-Agent": "canon-indexer/0.1 (personal research project)",
      // See the file header: the page sets this itself via JavaScript and reloads.
      Cookie: "verified=1",
    },
  });
  if (!res.ok)
    throw new Error(
      `DTA ${work.sourceId} svarade ${res.status} ${res.statusText}`,
    );
  const body = await res.text();
  if (!body.includes("<TEI")) {
    throw new Error(
      `DTA ${work.sourceId} gav ingen TEI — troligen ett okänt dokument-id.`,
    );
  }
  fs.writeFileSync(cached, body, "utf8");
  return body;
}

export function parseHeader(raw: string): DtaHeader {
  const head = raw.slice(0, Math.max(raw.indexOf("</teiHeader>"), 0) || 20_000);
  const source = /<sourceDesc\b[\s\S]*?<\/sourceDesc>/i.exec(head)?.[0] ?? "";
  const years = [...source.matchAll(/<date\b[^>]*>\s*\[?(\d{4})/gi)].map((m) =>
    Number(m[1]),
  );

  // The author appears as <persName><surname>…</surname><forename>…</forename>.
  const authorBlock = /<author\b[\s\S]*?<\/author>/i.exec(head)?.[0] ?? "";
  const surname = tagText(authorBlock, "surname");
  const forename = tagText(authorBlock, "forename");

  return {
    title: tagText(head, "title"),
    author: surname
      ? [surname, forename].filter(Boolean).join(", ")
      : tagText(head, "author"),
    year: years.length > 0 ? Math.min(...years) : null,
    licence:
      tagText(head, "licence") ??
      /<licence[^>]*target="([^"]+)"/i.exec(head)?.[1] ??
      null,
  };
}

/**
 * Checks that the ID points to the work the manifest claims, and that the file
 * itself states a free license.
 *
 * Done on every fetch and not just in the generator, for the same reason as with
 * the other sources: the manifest is a file that can be hand-edited.
 */
export function verifyHeader(raw: string, work: CanonWork): void {
  const head = parseHeader(raw);

  if (!head.licence || !FREE_LICENCE.test(head.licence)) {
    throw new Error(
      `${work.id}: DTA anger licensen som "${(head.licence ?? "(saknas)").slice(0, 90)}" — ` +
        `bara fritt licensierade eller gemenfria utgåvor får indexeras.`,
    );
  }

  const title = (head.title ?? "").toLowerCase();
  const author = (head.author ?? "").toLowerCase();

  if (work.titleMatch && !title.includes(work.titleMatch)) {
    throw new Error(
      `Fel utgåva för ${work.id}: ${work.sourceId} har titeln "${head.title}", ` +
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
 * Typographic normalization of the 18th- and 19th-century print.
 *
 * Only characters that are the same letter in a different cut. Spelling is left
 * alone — "Kentniß", "Theil", "beygelegt" should stay exactly as printed.
 *
 * Umlauts are what would otherwise do the most damage. Older German print sets ü
 * as a u with a small e above it, and DTA faithfully renders that as `u` +
 * U+0364. Left as is, "künftigen" is a different character sequence than the word
 * anyone would search for, and the word exists for neither BM25 nor the
 * embedding. Kant's Kritik has 11,897 of these.
 */
function normalizeTypography(s: string): string {
  return (
    s
      .replace(/[ſẛ]/g, "s")
      // Vowel + combining e above → umlaut. Order matters: the combining
      // character sits AFTER its base letter in Unicode.
      .replace(/aͤ/g, "ä")
      .replace(/oͤ/g, "ö")
      .replace(/uͤ/g, "ü")
      .replace(/Aͤ/g, "Ä")
      .replace(/Oͤ/g, "Ö")
      .replace(/Uͤ/g, "Ü")
      // The same thing written with combining diaeresis, which occurs in newer files.
      .normalize("NFC")
      .replace(/ﬀ/g, "ff")
      .replace(/ﬁ/g, "fi")
      .replace(/ﬂ/g, "fl")
  );
}

interface Segment {
  path: string[];
  head: string | null;
  paragraphs: string[];
}

/**
 * Tags whose content is never the work's text.
 *
 * `fw` is the important one: "forme work" is running headers, page numbers, and
 * catchwords — the hyphenated word the print repeats at the bottom of the page to
 * show the next page's opening. Kant's Kritik has 1,946 of them, and without the
 * filter "fah-" and "Einleitung." land in the middle of the body text once per
 * page.
 */
const DROP =
  /^(fw|note|figure|figDesc|teiHeader|gap|sic|orig|abbr|bibl|ref|formula)$/i;

/** Tags that end a paragraph. */
const BLOCK =
  /^(p|ab|lg|sp|speaker|stage|item|list|label|trailer|closer|opener|salute|signed|argument|table|row|cell|quote|cit|epigraph)$/i;

function parseBody(raw: string): Segment[] {
  const start = raw.search(/<body\b/i);
  const end = raw.lastIndexOf("</body>");
  if (start === -1 || end === -1) return [];
  const body = raw.slice(raw.indexOf(">", start) + 1, end);

  const segments: Segment[] = [];
  const divs: string[] = [];
  const divPushed: boolean[] = [];

  let buffer = "";
  let dropDepth = 0;
  let dropTag = "";
  let pendingHead: string | null = null;
  /** Set by `<lb/>`: the next text node's leading whitespace belongs to the file, not the text. */
  let swallowSpace = false;

  const flushParagraph = () => {
    const text = buffer
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
    buffer = "";
    if (text.length === 0) return;
    segments.push({ path: [...divs], head: pendingHead, paragraphs: [text] });
    pendingHead = null;
  };

  const tokens = body.matchAll(
    /<\/?([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\/?>|([^<]+)/g,
  );

  for (const tok of tokens) {
    const [whole, name, attrs = "", text] = tok;

    if (text !== undefined) {
      if (dropDepth === 0) {
        // `<lb/>` is always followed by the line break in the source file, and
        // that break belongs to the file's formatting, not to the text. Without
        // this step, "wirk-<lb/>\nliche" would become "wirk\nliche" instead of
        // "wirkliche": the word gets joined back together and then split again
        // anyway, by the character that came after it.
        buffer += decodeEntities(
          swallowSpace ? text.replace(/^[ \t\r\n]+/, "") : text,
        );
        swallowSpace = false;
      }
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

    // Line break. If the line ends in a hyphen, the word is split and must be
    // rejoined without a space — 6,924 of Hegel's 21,693 lines do, 6,807 of
    // Kant's 24,095. Otherwise a line break is just a space: the print
    // breaks lines, the author wrote paragraphs.
    if (/^lb$/i.test(tag)) {
      if (/[-¬­]\s*$/.test(buffer)) buffer = buffer.replace(/[-¬­]\s*$/, "");
      else buffer += " ";
      swallowSpace = true;
      continue;
    }

    if (!closing && DROP.test(tag)) {
      if (!selfClosing) {
        dropDepth = 1;
        dropTag = tag.toLowerCase();
      }
      continue;
    }

    if (/^div$/i.test(tag)) {
      if (closing) {
        flushParagraph();
        if (divPushed.pop()) divs.pop();
        continue;
      }
      if (selfClosing) continue;
      flushParagraph();
      const n = /\bn="([^"]*)"/i.exec(attrs)?.[1] ?? "";
      // DTA's divs carry only `n` and nesting depth, never a type. The reference
      // therefore has to come from the headings; `n` only says which section in
      // the sequence.
      if (n) {
        divs.push(n);
        divPushed.push(true);
      } else divPushed.push(false);
      continue;
    }

    if (/^head$/i.test(tag)) {
      if (closing) {
        const head = buffer.replace(/\s+/g, " ").trim();
        buffer = "";
        pendingHead = head || null;
      } else flushParagraph();
      continue;
    }

    if (/^(hi|emph)$/i.test(tag)) {
      // `#g` is letter-spaced type, which German print uses where we use italics.
      const rend = /\brendition="([^"]*)"/i.exec(attrs)?.[1] ?? "";
      if (rend && !/#g|#i|#b|#k/.test(rend)) continue;
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

  return segments.filter((s) => s.paragraphs.length > 0);
}

/**
 * The segments as text, with headings chunking recognizes.
 *
 * DTA's divs have no type, so the reference has to come from the source's own
 * heading — "Erſtes Hauptſtück. Von der Logik überhaupt". It's capitalized,
 * since that's how `looksLikeHeading` finds a heading, and trimmed to eight
 * words when it doesn't begin with one of the German keywords.
 */
function render(segments: Segment[]): string {
  const out: string[] = [];
  const KEYWORD =
    /^(BUCH|KAPITEL|HAUPTST(Ü|U)CK|ABSCHNITT|ABTH?EILUNG|TH?EIL|AUFZUG|AKT|SZENE|SCENE|GESANG|VORLESUNG)\b/i;

  for (const segment of segments) {
    if (segment.head) {
      const head = segment.head.replace(/_/g, "").trim();
      const words = head.split(/\s+/).filter(Boolean);
      // If the line begins with a keyword it's recognized no matter how long, up
      // to chunking's 90 characters. Otherwise it must stay within eight words.
      const line =
        KEYWORD.test(head) || words.length <= 8
          ? head
          : words.slice(0, 8).join(" ") + "…";
      if (line) out.push(line.toUpperCase().slice(0, 88));
    }
    out.push(...segment.paragraphs);
  }

  return normalizeTypography(out.join("\n\n"))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toText(raw: string, work: CanonWork): string {
  const segments = parseBody(raw);
  if (segments.length === 0) {
    throw new Error(
      `${work.id}: ${work.sourceId} har ingen brödtext att indexera.`,
    );
  }
  return render(segments);
}

/** The reader's address at DTA. */
export function readerUrl(id: string): string {
  return `${BASE}/book/show/${id}`;
}
