/**
 * The way out of the app: a passage that can be pasted into an essay and
 * still be traced back.
 *
 * Pure functions, no DB call, no server. `PassagePayload` already carries
 * everything a citation needs — author, work, translator, locator, source
 * and link — so the formatting can happen client-side on data that's
 * already there.
 *
 * ## The year is deliberately absent from the reference
 *
 * `year` is the author's *year of death*, not the work's year of
 * publication. For the Gutenberg portion, that's the only date the
 * catalogue has. It's good enough for periodisation and chronological
 * sorting — but a reference that writes "Plato, The Republic (1892)"
 * asserts something about the edition that nobody has verified, and that
 * kind of silent error is exactly what the rest of the app is built to
 * avoid. What's actually true about the text is which source it was
 * fetched from, and when.
 *
 * The year of death is included where the format has a place for a labeled
 * note — in BibTeX and RIS as an annotation — but never as `year`.
 */

import { DEFAULT_LOCALE, formatYear, t, tn, type Locale } from "./i18n";
import { cleanLocator } from "./locator";
import { SOURCE_LABEL } from "./taxonomy";
import type { PassagePayload } from "./protocol";

/**
 * What an export should be set to.
 *
 * The language follows the UI, not the text: someone reading the app in
 * English writes their essay in English, and "trans. Jowett, retrieved
 * 2026-09-02" is the line they should be able to paste in. The work's and
 * author's names are untouched — they're data from the collection, not UI text.
 */
export interface CiteOptions {
  locale?: Locale;
  fetchedAt?: Date;
}

/** What the citation needs out of a passage. Deliberately narrower than
 *  PassagePayload: it makes the functions testable and usable even from a
 *  future collection view. */
export type Citable = Pick<
  PassagePayload,
  | "workId"
  | "author"
  | "title"
  | "translator"
  | "locator"
  | "text"
  | "source"
  | "sourceUrl"
  | "year"
>;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Escapes the two characters Markdown reads as emphasis syntax.
 *
 * The title is the only thing this app wraps in `*…*` with content it
 * didn't write itself — a title containing a literal `*` or `_` (rare, but
 * the collection has titles with both) closed the emphasis early or opened
 * one that never closed, breaking every line after it in the rendered export.
 */
function mdEscape(s: string): string {
  return s.replace(/([*_])/g, "\\$1");
}

/**
 * The source reference as one sentence.
 *
 * Naming the source and linking to it isn't courtesy but the license
 * condition for Litteraturbanken's CC-BY editions, and the retrieval date is
 * the only year in the line that's actually verified.
 */
export function reference(p: Citable, options: CiteOptions = {}): string {
  const { locale = DEFAULT_LOCALE, fetchedAt = new Date() } = options;
  const parts = [`${p.author}, *${mdEscape(p.title)}*`];
  if (p.locator) parts.push(cleanLocator(p.locator));
  if (p.translator) {
    parts.push(t(locale, "citation.translatedBy", { name: p.translator }));
  }

  const source = SOURCE_LABEL[p.source] ?? p.source;
  const where = p.sourceUrl ? `${source}, ${p.sourceUrl}` : source;
  const retrieved = t(locale, "citation.retrieved", {
    date: isoDate(fetchedAt),
  });
  return `${parts.join(", ")}. ${where} (${retrieved}).`;
}

/**
 * A passage as Markdown: block quote followed by the reference.
 *
 * Line breaks inside the passage are preserved — verse is verse, and `> `
 * has to be placed on every line for the block quote to survive a Markdown renderer.
 */
export function asMarkdown(p: Citable, options: CiteOptions = {}): string {
  const quote = p.text
    .trim()
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
  return `${quote}\n>\n> — ${reference(p, options)}`;
}

/**
 * The whole search as a working document.
 *
 * Claude's rationales are included as body text under each quotation.
 * They're the only thing that says *why* the passage is there, and that's
 * the note someone would otherwise have to write by hand when the material
 * becomes an essay.
 *
 * Every passage in the payload is included. The function used to have an
 * `includeUnselected` that distinguished the selection from the rejected
 * candidates; since the answer now consists only of the selection, there's
 * no such distinction left to make.
 */
export function searchAsMarkdown(
  question: string,
  passages: PassagePayload[],
  options: CiteOptions = {},
): string {
  const { locale = DEFAULT_LOCALE, fetchedAt = new Date() } = options;

  // Numbered by position in the array the caller passed, not `p.index` —
  // that field is fixed at retrieval time (see its own comment on
  // `PassagePayload`) and stops matching the row it's printed under the
  // moment the reader switches to chronological order or the caller passes
  // a resorted list, exactly the way `PassageAccordion`'s own `position`
  // prop already works.
  const blocks = passages.map((p, i) => {
    const head = `### ${i + 1}. ${p.author}, *${mdEscape(p.title)}*`;
    const meta = [
      p.locator && cleanLocator(p.locator),
      p.translator &&
        t(locale, "citation.translatedBy", { name: p.translator }),
    ]
      .filter(Boolean)
      .join(" · ");
    const body = [
      head,
      meta && `*${meta}*`,
      asMarkdown(p, { locale, fetchedAt }),
    ].filter((s) => s !== "");
    // The blank line is added after the filter, not in the list: it
    // separates the rationale from the block quote above, and without it
    // Markdown reads the next line as a continuation of the quote instead
    // of as a note about it.
    body.push("", p.relevance);
    return body.join("\n");
  });

  return [
    `# ${question}`,
    "",
    `*${tn(locale, "citation.subtitle", passages.length, { date: isoDate(fetchedAt) })}*`,
    "",
    ...blocks.flatMap((b) => [b, ""]),
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");
}

/** A passage as it sits in a project: the quotation, its origin, and its note. */
export interface ProjectEntry {
  passage: PassagePayload;
  /** The question the passage came from. An empty string omits the line. */
  prompt: string;
  /** The user's own note. An empty string omits the line. */
  note: string;
}

/**
 * A whole project as a working document.
 *
 * Kept separate from `searchAsMarkdown` even though the shape is nearly
 * identical, and the difference is the whole point of this function: here
 * there are TWO notes under each quotation, and they aren't interchangeable.
 * Claude's rationale says why the passage answered a question asked once;
 * the user's note says why it was kept. The latter is the one that actually
 * carries over into the essay, and so it comes first.
 *
 * The question is printed per passage instead of as a heading. A project
 * has no single question — it's gathered from a couple dozen — and without
 * the line there's no way to see which answer a quotation was once part of.
 */
export function projectAsMarkdown(
  title: string,
  entries: ProjectEntry[],
  options: CiteOptions = {},
): string {
  const { locale = DEFAULT_LOCALE, fetchedAt = new Date() } = options;

  const blocks = entries.map(({ passage: p, prompt, note }) => {
    const head = `### ${p.index}. ${p.author}, *${mdEscape(p.title)}*`;
    const meta = [
      p.locator && cleanLocator(p.locator),
      p.translator &&
        t(locale, "citation.translatedBy", { name: p.translator }),
    ]
      .filter(Boolean)
      .join(" · ");

    const body = [head, meta && `*${meta}*`, asMarkdown(p, { locale, fetchedAt })]
      .filter((s) => s !== "");

    if (note) body.push("", `**${t(locale, "citation.note")}** ${note}`);
    if (p.relevance) body.push("", p.relevance);
    if (prompt) {
      body.push("", `*${t(locale, "citation.fromQuestion", { prompt })}*`);
    }
    return body.join("\n");
  });

  return [
    `# ${title}`,
    "",
    `*${tn(locale, "citation.projectSubtitle", entries.length, { date: isoDate(fetchedAt) })}*`,
    "",
    ...blocks.flatMap((b) => [b, ""]),
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");
}

/**
 * The works behind the passages, each appearing once.
 *
 * A reference manager can't take a passage — it takes a work. Three
 * quotations from *The Republic* should become one entry, not three. The key
 * is `workId`, which is stable; author plus title would work almost always
 * and fail on multi-volume works, where Gibbon's six volumes are named
 * almost but not quite the same thing.
 */
function uniqueWorks(passages: Citable[]): Citable[] {
  const seen = new Set<string>();
  const out: Citable[] = [];
  for (const p of passages) {
    if (seen.has(p.workId)) continue;
    seen.add(p.workId);
    out.push(p);
  }
  return out;
}

/**
 * BibTeX key: surname + the work's slug, without characters BibTeX chokes on.
 *
 * The collection stores the author in display form — "Edward Gibbon," not
 * "Gibbon, Edward" — so the surname is the *last* word, not the first.
 * Traditional names like "Beowulf" and "the Bible" are a single word and
 * survive the same rule.
 */
function bibKey(p: Citable): string {
  const words = p.author.trim().split(/\s+/);
  const surname = words[words.length - 1] || "anon";
  return `${surname}:${p.workId}`.toLowerCase().replace(/[^a-z0-9:_-]/g, "");
}

/**
 * BibTeX values must not carry unescaped `\ { } % & # _ $` — LaTeX reads
 * every one of them specially once the `.bbl` is typeset (`%` opens a
 * comment mid-line, `&` and `#` are macro/table syntax, `_` and `$` toggle
 * math mode), and used to reach the output raw for every field but author
 * and title. `url` is deliberately excluded — see the field below.
 */
function bibEscape(s: string): string {
  return s.replace(/[\\{}%&#_$]/g, "");
}

/**
 * Whether a name needs `{{double braces}}` to survive BibTeX's own
 * First/von/Last splitting.
 *
 * The collection stores names in display form, and two shapes of them
 * defeat that heuristic: a single word ("Homer", "Beowulf") has nothing to
 * split, and a lowercase word before the last one reads as a "von"
 * particle — "Erasmus of Rotterdam" becomes von=of, last=Rotterdam,
 * first=Erasmus, and prints as "Rotterdam, Erasmus of" under most styles.
 * Double braces tell BibTeX to treat the whole field as one indivisible
 * unit instead, printed exactly as given.
 */
function protectName(name: string): boolean {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return true;
  return words.slice(0, -1).some((w) => /^\p{Ll}/u.test(w));
}

/** Escaped, and wrapped in double braces when `protectName` says the name needs it. */
function bibName(name: string): string {
  const escaped = bibEscape(name);
  return protectName(name) ? `{${escaped}}` : escaped;
}

export function worksAsBibtex(
  passages: Citable[],
  options: CiteOptions = {},
): string {
  const { locale = DEFAULT_LOCALE, fetchedAt = new Date() } = options;
  return uniqueWorks(passages)
    .map((p) => {
      const fields: [string, string][] = [
        ["author", bibName(p.author)],
        ["title", bibEscape(p.title)],
      ];
      if (p.translator) fields.push(["translator", bibName(p.translator)]);
      fields.push(["publisher", bibEscape(SOURCE_LABEL[p.source] ?? p.source)]);
      // Not `bibEscape`: a URL's `%`, `&` and `#` are meaningful characters
      // in the address itself (percent-encoding, query separators,
      // fragments), and stripping them would corrupt the link rather than
      // protect the build — `\url{}`, which is how every style file that
      // prints this field wraps it, already handles them verbatim.
      if (p.sourceUrl) fields.push(["url", p.sourceUrl]);
      fields.push(["urldate", isoDate(fetchedAt)]);
      // The year of death as a labeled note, never as `year`. See the module header.
      fields.push([
        "note",
        bibEscape(t(locale, "citation.deathNote", { year: formatYear(p.year, locale) })),
      ]);

      const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(",\n");
      return `@book{${bibKey(p)},\n${body}\n}`;
    })
    .join("\n\n")
    .concat("\n");
}

export function worksAsRis(
  passages: Citable[],
  options: CiteOptions = {},
): string {
  const { locale = DEFAULT_LOCALE, fetchedAt = new Date() } = options;
  return uniqueWorks(passages)
    .map((p) => {
      const lines = ["TY  - BOOK", `AU  - ${p.author}`, `TI  - ${p.title}`];
      if (p.translator) lines.push(`A2  - ${p.translator}`);
      lines.push(`PB  - ${SOURCE_LABEL[p.source] ?? p.source}`);
      if (p.sourceUrl) lines.push(`UR  - ${p.sourceUrl}`);
      lines.push(`Y2  - ${isoDate(fetchedAt)}`);
      lines.push(
        `N1  - ${t(locale, "citation.deathNote", { year: formatYear(p.year, locale) })}`,
      );
      lines.push("ER  - ");
      return lines.join("\n");
    })
    .join("\n\n")
    .concat("\n");
}

/** Filename for a downloaded export. The question as a slug, shortened. */
export function exportFilename(question: string, extension: string): string {
  const slug =
    question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "canon";
  return `${slug}.${extension}`;
}
