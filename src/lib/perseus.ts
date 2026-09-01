/**
 * Text retrieval from Perseus Digital Library.
 *
 * Perseus is the only source in the collection that hands out antiquity *with its
 * own reference intact*. Gutenberg's Thucydides is a text file where chunking has
 * to guess where the books begin; Perseus's same text is TEI where the book,
 * chapter and paragraph are spelled out in the markup. The difference shows in
 * the interface: a passage can be cited as "Book I, Chapter 22" instead of as
 * "Chapter I" or nothing at all, and that's the form a classical text is actually
 * looked up by.
 *
 * TWO ARCHIVES, ONE ADDRESS FORM. The texts live in PerseusDL/canonical-greekLit
 * and PerseusDL/canonical-latinLit on GitHub, and every text has a CTS URN that
 * translates directly into a path:
 *
 *   urn:cts:greekLit:tlg0003.tlg001.perseus-eng4
 *   → canonical-greekLit/data/tlg0003/tlg001/tlg0003.tlg001.perseus-eng4.xml
 *
 * That's why `sourceId` here is the URN and nothing else: it's the source's own
 * stable identifier, it carries which archive the text lives in, and it's what
 * Scaife — Perseus's own reader — takes as an address.
 *
 * ENGLISH TRANSLATIONS ONLY. The archives contain 814 Greek and 428 Latin
 * original texts, and none of them are indexed. The reason isn't that they'd be
 * uninteresting but that the chain can't carry them: `Language` is `"en" | "sv"`
 * [and the other five now added], chunking's heading rules only exist for those
 * languages, and a polytonic Greek passage in the results list doesn't answer a
 * Swedish query — it needs to be readable, not just findable. The 1,047 English
 * translations are what can actually be used to answer.
 *
 * THE RIGHTS. The whole archive is under CC BY-SA 4.0, but an archive is not a
 * license — the same lesson `marxists.ts` carries — and unlike MIA, Perseus has a
 * machine-readable line to test against. Every file carries its own license
 * statement in teiHeader:
 *
 *   <availability>
 *     <licence target="https://creativecommons.org/licenses/by-sa/4.0/">…</licence>
 *   </availability>
 *
 * It's read on every fetch, just like Litteraturbanken's rights line, and a file
 * without a CC statement is rejected no matter what the manifest says.
 *
 * BY-SA IS NOT PUBLIC DOMAIN. Unlike the Gutenberg portion, this source imposes a
 * condition the app must meet: the source must be credited and linked. That's
 * already done — `citation.ts` prints `SOURCE_LABEL` and `sourceUrl` in every
 * reference, and `PassageAccordion` shows the same link — but the condition is
 * now a requirement, not a courtesy. Don't touch that line without knowing that.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "./db";
import { decodeEntities } from "./html";
import { tagText } from "./tei";
import type { CanonWork } from "./corpus";

const RAW_BASE = "https://raw.githubusercontent.com/PerseusDL";

/** Perseus's own reader. The address a reader should land on, not the raw file on GitHub. */
const SCAIFE = "https://scaife.perseus.org/reader";

/**
 * CTS namespace → the archive it lives in. Perseus has more archives
 * (`copticLit`, `hebrewLit`), but only these two have English translations of
 * canonical works.
 */
const REPOS: Record<string, string> = {
  greekLit: "canonical-greekLit",
  latinLit: "canonical-latinLit",
};

/**
 * How short a citation step is allowed to average and still become a locator.
 *
 * This number is chunking's `TARGET_MIN`, and that's not a coincidence.
 * `chunkText` flushes the buffer at *every* heading, so a citation step shorter
 * than this turns every step into its own chunk. Thucydides Book I has 146
 * chapters averaging 1,250 characters — chapter works fine as a locator. The same
 * book's paragraphs average 380 characters, and had paragraph been chosen, every
 * passage in the search would be a sentence long and practically unsearchable.
 * See `.probe-perseus.ts`, which prints the average per level for every work.
 */
const LOCATOR_MIN_CHARS = 900;

/** Deepest citation level tried at all. Book → chapter → section. */
const MAX_LOCATOR_DEPTH = 3;

/** The rights line meaning Perseus licenses the file. */
const CC_LICENCE = /creativecommons\.org\/licenses|creative commons/i;

/**
 * Print years up to and including this count as free on age alone.
 *
 * ASSUMED, not measured. A translation's copyright term is the translator's
 * lifetime plus seventy years, and the source doesn't publish the translator's
 * year of death — only the publisher's print year. A hundred years from printing
 * is the proxy: a translator who publishes at thirty and lives to ninety has only
 * been dead seventy years as of print year + 130, while one who publishes at
 * fifty and dies at seventy-five is free as of print year + 95. A hundred sits in
 * the middle and on the cautious side of what actually occurs in the archive. One
 * year too many costs nothing; one year too few makes the app the publisher of a
 * copyrighted translation.
 */
export const FREE_BY_AGE = new Date().getFullYear() - 100;

/**
 * Print years after this are rejected even with a CC line.
 *
 * Perseus's own license statement is one of two independent grounds for a file to
 * be indexed (see `verifyHeader`), but it's also a claim about rights to someone
 * else's translation. For the 19th-century editions it doesn't matter — they're
 * free regardless. For a Loeb volume from 1959, the CC line is the only thing
 * that distinguishes it, and that's exactly the kind of case the MIA lesson says
 * no to.
 *
 * Measured on 70 randomly sampled English files from the two archives: 48 are
 * free on age (print year ≤ 1926), 11 more qualify on the CC line with print
 * years 1927–1950, and 11 are rejected — four of them CC-marked editions from
 * 1959 and 2000. Lucian from 1959 is the only author excluded entirely, and the
 * Bible from 2000 is already in the collection via Gutenberg.
 */
export const MODERN_IMPRINT = 1950;

export interface PerseusRef {
  namespace: string;
  repo: string;
  /** The path within the archive, without the hostname. */
  file: string;
}

/**
 * URN → archive and path.
 *
 * The form is `urn:cts:<namespace>:<textgroup>.<work>.<edition>`, and the
 * directory tree mirrors the dots: the text group is the first directory, the
 * work the second, the full identifier the filename.
 */
export function resolve(urn: string): PerseusRef {
  const m = /^urn:cts:([A-Za-z]+):([^.\s]+)\.([^.\s]+)\.([^.\s:]+)$/.exec(
    urn.trim(),
  );
  if (!m)
    throw new Error(`"${urn}" är inte ett CTS-URN för en enskild utgåva.`);
  const [, namespace, group, work, edition] = m;
  const repo = REPOS[namespace];
  if (!repo) throw new Error(`Okänd CTS-namnrymd "${namespace}" i ${urn}.`);
  return {
    namespace,
    repo,
    file: `data/${group}/${work}/${group}.${work}.${edition}.xml`,
  };
}

/** The reader's address at Perseus, not the raw file's address at GitHub. */
export function readerUrl(urn: string): string {
  return `${SCAIFE}/${urn}/`;
}

/**
 * Fetches the TEI file, with a disk cache so a rerun doesn't hit GitHub again.
 *
 * No pause between fetches, unlike against Gutenberg and MIA:
 * raw.githubusercontent.com is a CDN built for exactly this and has no crawl
 * delay to honor. The disk cache still ensures each file is fetched only once.
 */
export async function fetchRaw(work: CanonWork): Promise<string> {
  const ref = resolve(work.sourceId);
  const cacheDir = path.join(CACHE_DIR, "perseus");
  fs.mkdirSync(cacheDir, { recursive: true });
  const cached = path.join(
    cacheDir,
    `${work.sourceId.replace(/[^a-z0-9.-]+/gi, "_")}.xml`,
  );
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");

  const url = `${RAW_BASE}/${ref.repo}/master/${ref.file}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "canon-indexer/0.1 (personal research project)" },
  });
  if (!res.ok) {
    throw new Error(
      `Perseus ${work.sourceId} svarade ${res.status} ${res.statusText}`,
    );
  }
  const body = await res.text();
  fs.writeFileSync(cached, body, "utf8");
  return body;
}

export interface PerseusHeader {
  title: string | null;
  author: string | null;
  translator: string | null;
  licence: string | null;
  /** The publisher's print year, from `sourceDesc`. Missing in some files. */
  imprintYear: number | null;
  language: string | null;
}

/**
 * Reads teiHeader.
 *
 * Only the header, not the whole file: `fileDesc` ends where `encodingDesc`
 * begins, and a `<date>` further down in the body text could otherwise be read as
 * the publisher's print year. Thucydides in English is 1.8 MB, and nearly all of
 * that is text.
 */
export function parseHeader(raw: string): PerseusHeader {
  const head = raw.slice(0, Math.max(raw.indexOf("</fileDesc>"), 0) || 8000);

  const licence =
    tagText(head, "licence") ??
    /<licence[^>]*target="([^"]+)"/i.exec(head)?.[1] ??
    null;

  // `sourceDesc` describes the *source edition* — the printed edition Perseus
  // digitized. Its date is what says something about the translation's age;
  // `publicationStmt` above carries Perseus's own publication and is always
  // modern.
  const source = /<sourceDesc\b[\s\S]*?<\/sourceDesc>/i.exec(raw)?.[0] ?? "";
  const years = [...source.matchAll(/<date\b[^>]*>\s*(\d{4})/gi)].map((m) =>
    Number(m[1]),
  );

  return {
    title: tagText(head, "title"),
    author: tagText(head, "author"),
    translator:
      /<editor[^>]*role="translator"[^>]*>([\s\S]*?)<\/editor>/i
        .exec(head)?.[1]
        ?.replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim() || null,
    licence,
    imprintYear: years.length > 0 ? Math.min(...years) : null,
    language: /<teiHeader[^>]*xml:lang="([a-z]+)"/i.exec(head)?.[1] ?? null,
  };
}

/**
 * May the text be indexed, and on what grounds?
 *
 * TWO GROUNDS, EACH SUFFICIENT — and that's a different thing than loosening a
 * check. A translation is free either because it's old enough (the same ground
 * the whole Gutenberg portion rests on) or because the rights holder has
 * licensed it (the same ground the MIA portion rests on). Perseus's archive
 * contains both kinds mixed together, and requiring both would have thrown out
 * Cicero's letters in Shuckburgh's 1908 translation — free since 1976 — solely
 * because that particular file doesn't repeat the archive's license line in its
 * own header. Measured on 70 randomly sampled files, 31 of them lack the line;
 * 24 of those 31 are 19th-century editions.
 *
 * What does *not* suffice is a CC line alone over a modern edition. See
 * `MODERN_IMPRINT`.
 */
export function rightsGround(head: PerseusHeader): "ålder" | "licens" | null {
  const year = head.imprintYear;
  if (year === null || year > MODERN_IMPRINT) return null;
  if (year <= FREE_BY_AGE) return "ålder";
  return head.licence && CC_LICENCE.test(head.licence) ? "licens" : null;
}

/**
 * Checks that the URN points to the work the manifest claims — and that the text
 * may be indexed.
 *
 * The check is done here and not just in the generator, for the same reason as
 * with Litteraturbanken and MIA: the manifest is a file that can be edited, and
 * this is the line that actually stands in the way when a text is fetched.
 */
export function verifyHeader(raw: string, work: CanonWork): void {
  const head = parseHeader(raw);

  if (rightsGround(head) === null) {
    throw new Error(
      `${work.id}: förlagan är tryckt ${head.imprintYear ?? "(okänt år)"} och Perseus ` +
        `anger licensen som "${head.licence ?? "(saknas)"}" — varken fri på ålder ` +
        `(≤ ${FREE_BY_AGE}) eller CC-licensierad inom ${MODERN_IMPRINT}.`,
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

interface Segment {
  /** The citation path, outermost first: [["book","1"],["chapter","22"]]. */
  path: [string, string][];
  /** The div's own heading, if it has one. */
  head: string | null;
  paragraphs: string[];
}

/** Tags whose content is never the work's text. */
const DROP =
  /^(note|bibl|ref|figure|graphic|gap|orig|reg|del|teiHeader|pb|cb|lb|space|witDetail|app|rdg)$/i;

/**
 * `<milestone unit="…">` that is a citation step, not a print artifact.
 *
 * `card` and `page` number Perseus's own screen view and the publisher's leaf,
 * respectively; neither is a reference anyone looks up, and `card` is moreover
 * denser than the chapters and would have taken over as locator.
 */
const MILESTONE_UNIT =
  /^(book|chapter|section|letter|poem|oration|speech|part|fragment|entry|verse)$/i;

/** Tags that end a paragraph. */
const BLOCK =
  /^(p|l|lg|ab|sp|speaker|stage|quote|cit|list|item|label|trailer|closer|opener|salute|signed|argument|table|row|cell)$/i;

/** Marks a div as having been front matter, instead of a set of citation steps. */
const FRONT = -1;

/**
 * A div's citation steps.
 *
 * Perseus marks the same thing three ways, and all three occur in the archives:
 *
 *   <div type="textpart" subtype="book" n="1">   the newer EpiDoc form
 *   <div type="book" n="1">                      the older form, without subtype
 *   <div type="letter" n="text=F:book=5:letter=7">  everything packed into one n
 *
 * The third form is what makes a dedicated function necessary: Cicero's letters
 * carry book and letter in the same attribute, and reading it as a single step
 * would make the reference "Letter Text=f:book=5:letter=7" instead of "Book 5,
 * Letter 7".
 */
function citationSteps(unit: string, n: string): [string, string][] {
  if (!n) return unit ? [[unit, ""]] : [];

  if (n.includes("=")) {
    const steps = n
      .split(":")
      .map((piece) => /^([^=]+)=(.*)$/.exec(piece))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1].trim(), m[2].trim()] as [string, string]);
    if (steps.length > 0) return steps;
  }

  return [[unit || "part", n]];
}

/**
 * TEI → segments.
 *
 * A small hand-rolled pass instead of an XML parser: the repo has none among its
 * dependencies, the files are machine-generated and regular, and what needs to be
 * understood is four things — `div` nesting, paragraph boundaries, italics, and
 * what to discard. A parser would just hand back a tree that still has to be
 * walked in exactly this way.
 */
function parseBody(raw: string): Segment[] {
  const start = raw.search(/<body\b/i);
  const end = raw.lastIndexOf("</body>");
  if (start === -1 || end === -1) return [];
  const body = raw.slice(raw.indexOf(">", start) + 1, end);

  const segments: Segment[] = [];
  const divs: [string, string][] = [];
  /**
   * How many citation steps each open div added, so `</div>` can remove exactly
   * as many. `FRONT` means front matter instead.
   *
   * This bookkeeping is needed because divs and citation steps aren't in a
   * one-to-one relationship: the edition's outermost div adds no step at all, and
   * the older n-form (`n="book=5:letter=7"`) adds two from a single div.
   */
  const divSteps: number[] = [];

  /**
   * Citation steps set by `<milestone>` instead of by divs.
   *
   * A third form, and the most common one among the Loeb-derived files: Cicero's
   * *Cato Maior* has a single div for the whole work and marks chapters inline
   * with `<milestone unit="chapter" n="1"/>`. Without this bookkeeping the work
   * gets no reference at all — 84 passages, zero locators.
   *
   * The level order is taken from the order the units first appear in, which is
   * the text's own: the chapter appears before its first section. A new "1" at
   * one level resets every level below it, otherwise section 7 of chapter 1 would
   * live on into chapter 2.
   */
  const mileUnits: string[] = [];
  const mileValues = new Map<string, string>();

  let buffer = "";
  let dropDepth = 0;
  let dropTag = "";
  /** How many nested divs deep we're standing in front matter, to be discarded. */
  let frontDepth = 0;
  /** The heading to attach to the next paragraph, set by `<head>`. */
  let pendingHead: string | null = null;

  const citationPath = (): [string, string][] => [
    ...divs.map((d) => [...d] as [string, string]),
    ...mileUnits
      .filter((u) => mileValues.has(u))
      .map((u) => [u, mileValues.get(u)!] as [string, string]),
  ];

  // One segment per paragraph, not per div: the reference can change mid-div when
  // it comes from a milestone, and then the path has to be read off at the
  // paragraph, not at the div's start. `render` still merges everything sharing a
  // reference.
  const flushParagraph = () => {
    const text = buffer
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
    buffer = "";
    if (text.length === 0) return;
    segments.push({
      path: citationPath(),
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

    if (/^milestone$/i.test(tag) && !closing) {
      const unit = /\bunit="([^"]*)"/i.exec(attrs)?.[1] ?? "";
      const n = /\bn="([^"]*)"/i.exec(attrs)?.[1] ?? "";
      if (frontDepth === 0 && n && MILESTONE_UNIT.test(unit)) {
        const at = mileUnits.indexOf(unit);
        if (at === -1) mileUnits.push(unit);
        else
          for (const deeper of mileUnits.slice(at + 1))
            mileValues.delete(deeper);
        // The paragraph breaks at the reference boundary, so a chunk never spans
        // two chapters and inherits the later one's number.
        if (mileValues.get(unit) !== n) flushParagraph();
        mileValues.set(unit, n);
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

    if (/^div$/i.test(tag)) {
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
      const subtype = /\bsubtype="([^"]*)"/i.exec(attrs)?.[1] ?? "";
      const type = /\btype="([^"]*)"/i.exec(attrs)?.[1] ?? "";

      // Perseus marks the translator's dedication, preface and index as
      // `n="front"` or `n="praef"` instead of mixing them with the work. That's a
      // structural claim from the source, and it's better than chunking's guess
      // at heading words — so front matter is dropped here and never reaches the
      // index.
      if (
        frontDepth > 0 ||
        /^(front|praef|praefatio|dedication|introduction)$/i.test(n)
      ) {
        frontDepth++;
        divSteps.push(FRONT);
        continue;
      }

      // The outermost div only wraps the edition and carries its URN as `n`. It's
      // not a citation step and shouldn't enter the reference.
      if (/^(translation|edition|version)$/i.test(type) || /^urn:/i.test(n)) {
        divSteps.push(0);
        continue;
      }

      const steps = citationSteps(subtype || type, n);
      divs.push(...steps);
      divSteps.push(steps.length);
      // Milestones belong to the div they sit in. If a work carries both divs and
      // milestones — books as divs, chapters as milestones — the previous book's
      // last chapter number would otherwise carry over into the next one.
      mileValues.clear();
      mileUnits.length = 0;
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

    // Italics in the raw text are written as `_like this_` — the same form
    // Gutenberg and Runeberg already use, and the only one `emphasis.tsx`
    // recognizes when rendering.
    if (/^(hi|emph|foreign|title)$/i.test(tag)) {
      const rend = /\brend="([^"]*)"/i.exec(attrs)?.[1] ?? "";
      if (/^(hi|emph)$/i.test(tag) && rend && !/ital|emph/i.test(rend))
        continue;
      buffer += "_";
      continue;
    }

    if (BLOCK.test(tag)) {
      if (/^(l|speaker|stage)$/i.test(tag) && closing) {
        // Verse and dialogue lines are lines within the same paragraph, not their
        // own paragraphs: a verse line is thirty characters and would otherwise
        // become its own chunk.
        buffer += "\n";
      } else {
        flushParagraph();
      }
      continue;
    }
  }
  flushParagraph();

  return segments.filter((s) => s.paragraphs.length > 0);
}

/**
 * The citation level that becomes the locator.
 *
 * The deepest level that's still on average longer than a chunk. See
 * `LOCATOR_MIN_CHARS`: a finer level doesn't give a finer reference, just
 * chopped-up passages, since chunking flushes at every heading.
 */
function locatorDepth(segments: Segment[]): number {
  let chosen = 1;
  for (let depth = 1; depth <= MAX_LOCATOR_DEPTH; depth++) {
    const byKey = new Map<string, number>();
    for (const s of segments) {
      if (s.path.length < depth) continue;
      const key = s.path
        .slice(0, depth)
        .map(([u, n]) => `${u}=${n}`)
        .join("/");
      const len = s.paragraphs.reduce((a, p) => a + p.length, 0);
      byKey.set(key, (byKey.get(key) ?? 0) + len);
    }
    if (byKey.size === 0) break;
    const mean = [...byKey.values()].reduce((a, b) => a + b, 0) / byKey.size;
    if (mean < LOCATOR_MIN_CHARS) break;
    chosen = depth;
  }
  return chosen;
}

/** "book" + "1" → "BOOK 1". */
function unitLabel(unit: string, n: string): string {
  const name = unit.replace(/[_-]+/g, " ").toUpperCase();
  return n ? `${name} ${n.toUpperCase()}` : name;
}

/**
 * Headings that just repeat what the reference already says.
 *
 * Perseus often sets `<head>The First Book</head>` on exactly the div already
 * named `book n="1"`, and without this filter the line becomes "BOOK 1, CHAPTER 1
 * — THE FIRST BOOK". A heading that contributes not a single word beyond the unit
 * name and the ordinal adds nothing.
 */
const EMPTY_HEAD =
  /^(the|a|an|and|of|book|chapter|part|section|letter|poem|oration|speech|volume|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|[ivxlcdm]+|\d+)$/i;

function headAddsSomething(head: string): boolean {
  return head
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .some((word) => !EMPTY_HEAD.test(word));
}

/**
 * The segments as text, with headings chunking recognizes.
 *
 * The heading is written in caps and begins with the citation word ("BOOK I,
 * CHAPTER 22"), which is exactly what `looksLikeHeading` looks for: either a
 * short all-caps line, or a line that *starts* with one of the keywords. The
 * div's own heading is appended when the line still stays under
 * `MAX_HEADING_LEN` — otherwise the reference matters more than the title.
 */
function render(segments: Segment[], depth: number): string {
  const out: string[] = [];
  let previous = "";

  for (const segment of segments) {
    const key = segment.path
      .slice(0, depth)
      .map(([u, n]) => `${u}=${n}`)
      .join("/");
    if (key !== previous && segment.path.length > 0) {
      previous = key;
      const cite = segment.path
        .slice(0, depth)
        .map(([unit, n]) => unitLabel(unit, n))
        .join(", ");
      const head =
        segment.head && headAddsSomething(segment.head)
          ? segment.head.toUpperCase()
          : "";
      const line =
        head && `${cite} — ${head}`.length <= 88 ? `${cite} — ${head}` : cite;
      out.push(line);
    }
    out.push(...segment.paragraphs);
  }

  return out
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * TEI → the text that gets chunked and saved to disk.
 *
 * Character offsets in the database point into this string, so it's what becomes
 * `data/texts/<id>.txt`.
 */
export function toText(raw: string, work: CanonWork): string {
  const segments = parseBody(raw);
  if (segments.length === 0) {
    throw new Error(
      `${work.id}: ${work.sourceId} har ingen brödtext att indexera.`,
    );
  }
  return render(segments, locatorDepth(segments));
}

/** The average length per citation level — `.probe-perseus.ts` reports it. */
export function levelStats(
  raw: string,
): { depth: number; units: number; mean: number }[] {
  const segments = parseBody(raw);
  const out: { depth: number; units: number; mean: number }[] = [];
  for (let depth = 1; depth <= MAX_LOCATOR_DEPTH; depth++) {
    const byKey = new Map<string, number>();
    for (const s of segments) {
      if (s.path.length < depth) continue;
      const key = s.path
        .slice(0, depth)
        .map(([u, n]) => `${u}=${n}`)
        .join("/");
      byKey.set(
        key,
        (byKey.get(key) ?? 0) + s.paragraphs.reduce((a, p) => a + p.length, 0),
      );
    }
    if (byKey.size === 0) break;
    const total = [...byKey.values()].reduce((a, b) => a + b, 0);
    out.push({ depth, units: byKey.size, mean: total / byKey.size });
  }
  return out;
}
