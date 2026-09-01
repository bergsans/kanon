/**
 * The collection's vocabulary: genres, eras, sources, languages — and the
 * shape of a work.
 *
 * Kept separate from `corpus.ts` on purpose. That module imports the
 * manifest, and the manifest is 1.4 MB of JSON. The UI needs the labels but
 * never the works, and importing them from the same file would drag the
 * whole collection along into the browser.
 */

import type { Locale } from "./i18n";

/**
 * The boundary years a work's `year` (the author's death year — see the
 * house note on that field) is sorted against are `eraOf` in
 * `scripts/lib/era.ts`, not here: `year` < 500 → antiken, < 1450 → medeltid,
 * < 1650 → renässans, < 1800 → upplysning, < 1900 → 1800-tal, else 1900-tal.
 * Every generator uses that one function now — it used to be copied into
 * each of the eight, and the Gutenberg copy alone drifted to a different
 * rule (`<=` and 1400/1600 instead of 1450/1650), filing Shakespeare and
 * Cervantes — both dead 1616 — under "upplysning" while every other source
 * called the same years "renässans". See `eraOf`'s own comment for the
 * full account.
 */
export type Era =
  | "antiken"
  | "medeltid"
  | "renässans"
  | "upplysning"
  | "1800-tal"
  | "1900-tal";

/**
 * The era in the UI. The names are the eras' own, not year ranges: the
 * collection spans from Homer to Kafka, and "antiquity" says something that
 * "−800–500" does not.
 *
 * The Swedish table is also the order the eras are listed in — chronological,
 * since that is the only order an era row can stand in without reading as a
 * mistake.
 */
export const ERA_LABEL: Record<Era, string> = {
  antiken: "antiken",
  medeltid: "medeltiden",
  renässans: "renässansen",
  upplysning: "upplysningen",
  "1800-tal": "1800-talet",
  "1900-tal": "1900-talet",
};

const ERA_LABEL_EN: Record<Era, string> = {
  antiken: "antiquity",
  medeltid: "the middle ages",
  renässans: "the renaissance",
  upplysning: "the enlightenment",
  "1800-tal": "the 19th century",
  "1900-tal": "the 20th century",
};

/** The eras in chronological order — derived from the label table, like `GENRES`. */
export const ERAS = Object.keys(ERA_LABEL) as Era[];

/** The era as it should read in the UI, in the reader's language. */
export function eraLabel(era: Era, locale: Locale): string {
  const table = locale === "en" ? ERA_LABEL_EN : ERA_LABEL;
  return table[era] ?? era;
}

/**
 * The kind of work. The collection is not just treatises: a question about
 * civilisation and barbarism is answered as often by Tacitus, Euripides or
 * Conrad as by Hobbes. The genre carries all the way to the reranking, which
 * is asked to spread the selection across several kinds — otherwise the
 * treatise always wins, because it *states* the matter outright.
 */
export type Genre =
  | "filosofi"
  | "politik"
  | "historia"
  | "antropologi"
  | "vetenskap"
  | "drama"
  | "dikt"
  | "prosa"
  | "religion"
  | "essä";

/**
 * Short label in the UI — the genre name works as it is.
 *
 * The Swedish table keeps its old name and is still the one `claude.ts`
 * builds its candidate list from. The prompt is written in Swedish and must
 * not switch language because a reader switched UI language: the expansion
 * and the reranking are the same call regardless of who's watching, and the
 * cache is shared across languages.
 */
export const GENRE_LABEL: Record<Genre, string> = {
  filosofi: "filosofi",
  politik: "politisk teori",
  historia: "historia",
  antropologi: "antropologi",
  vetenskap: "vetenskap",
  drama: "drama",
  dikt: "dikt & epos",
  prosa: "prosa",
  religion: "religion",
  essä: "essä",
};

const GENRE_LABEL_EN: Record<Genre, string> = {
  filosofi: "philosophy",
  politik: "political theory",
  historia: "history",
  antropologi: "anthropology",
  vetenskap: "science",
  drama: "drama",
  dikt: "poetry & epic",
  prosa: "prose",
  religion: "religion",
  essä: "essay",
};

/**
 * The genres in the order they should be listed — derived from the label
 * table and therefore always complete: a new genre in `Genre` missing a label
 * is already a compile error, and the list needs no update of its own.
 *
 * The order is the type's, not the alphabet's. Philosophy and political
 * theory come first because that is where the collection starts and widens
 * from — someone browsing the collection should meet the same emphasis the
 * selection has.
 */
export const GENRES = Object.keys(GENRE_LABEL) as Genre[];

/** The genre as it should read in the result list, in the reader's language. */
export function genreLabel(genre: Genre, locale: Locale): string {
  const table = locale === "en" ? GENRE_LABEL_EN : GENRE_LABEL;
  return table[genre] ?? genre;
}

/**
 * A selection out of something that arrived from outside — a POST body, a
 * database column.
 *
 * An empty list means *everything*, and that is the form the whole pipeline
 * relies on: retrieval skips the filter, the prompts don't mention it, the
 * cache key stays empty. Letting "all" instead mean every enumerated value
 * would make two spellings of the same search that wouldn't share a cache
 * with each other — so a complete selection falls back to the empty list
 * here.
 *
 * Unknown names are silently filtered out rather than rejecting the request.
 * The field comes from a UI the user doesn't type into, so a value outside
 * the list is a bug or a tampered body — either way the reasonable reading is
 * "this doesn't exist," not an error message nobody can fix.
 *
 * The order becomes the enumeration's, not the input's: the key must come out
 * the same regardless of the order the chips were clicked in.
 */
function parseSelection<T extends string>(input: unknown, all: T[]): T[] {
  if (!Array.isArray(input)) return [];
  const picked = new Set(input.filter((v): v is T => all.includes(v as T)));
  const selected = all.filter((v) => picked.has(v));
  return selected.length === all.length ? [] : selected;
}

export function parseGenres(input: unknown): Genre[] {
  return parseSelection(input, GENRES);
}

export function parseEras(input: unknown): Era[] {
  return parseSelection(input, ERAS);
}

/**
 * The search's scope: subjects, eras, or both. Empty lists = the whole collection.
 *
 * The two axes travel together through the whole pipeline — retrieval's
 * branches, Claude's two prompts, the cache key, the permalink — and carrying
 * them as one value instead of two parameters is what keeps them in step. A
 * branch that filtered by subject but not by era wouldn't be a partial
 * filter, it would be a bug.
 */
export interface CorpusFilter {
  genres: Genre[];
  eras: Era[];
}

export const NO_FILTER: CorpusFilter = { genres: [], eras: [] };

/**
 * The subjects and eras that *exist* to choose between — the selector's options.
 *
 * Same shape as the filter but not the same thing, hence its own name: one is
 * what the collection contains, the other what someone has asked for out of
 * it. Calling both `CorpusFilter` would have turned a mix-up into a valid
 * program.
 */
export interface CorpusFacets {
  genres: Genre[];
  eras: Era[];
}

export function parseFilter(input: {
  genres?: unknown;
  eras?: unknown;
}): CorpusFilter {
  return { genres: parseGenres(input.genres), eras: parseEras(input.eras) };
}

export function isFiltered(filter: CorpusFilter): boolean {
  return filter.genres.length > 0 || filter.eras.length > 0;
}

/**
 * The selection spelled out, in the reader's language: "filosofi, historia
 * · antiken".
 *
 * The middle dot separates the two axes. A comma would read as a single
 * enumeration, and "poetry, antiquity" isn't four genres and an era but two
 * questions asked at once — it's the difference between understanding the
 * answer and wondering why it contains nothing from the 1800s. Moved here
 * from `CanonSearch.tsx`, its first caller, once the searches archive page
 * needed the exact same line for the same reason.
 */
export function describeFilter(filter: CorpusFilter, locale: Locale): string {
  return [
    filter.genres.map((g) => genreLabel(g, locale)).join(", "),
    filter.eras.map((e) => eraLabel(e, locale)).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A selection as a key: sorted and comma-separated, empty string for everything.
 *
 * The form lives in one place because it has two readers that must agree —
 * the columns `searches.genres` and `searches.eras`, and the cache lookup
 * against them. If they drift apart, the answer to a filtered question gets
 * pulled out of an unfiltered one.
 */
export function genreKey(genres: Genre[]): string {
  return parseGenres(genres).join(",");
}

export function eraKey(eras: Era[]): string {
  return parseEras(eras).join(",");
}

/**
 * Where the text comes from. Determines how it's fetched, how front matter is
 * stripped, and how the ID is verified against the source's own metadata —
 * see `src/lib/sources.ts`.
 */
export type Source =
  | "gutenberg"
  | "litteraturbanken"
  | "runeberg"
  | "marxists"
  | "perseus"
  | "tcp"
  | "dta"
  | "wikisource";

export const SOURCE_LABEL: Record<Source, string> = {
  gutenberg: "Project Gutenberg",
  litteraturbanken: "Litteraturbanken",
  runeberg: "Projekt Runeberg",
  marxists: "Marxists Internet Archive",
  perseus: "Perseus Digital Library",
  tcp: "Text Creation Partnership",
  dta: "Deutsches Textarchiv",
  wikisource: "Wikisource",
};

/**
 * The sources in the table's order — derived from the label table for the
 * same reason as `GENRES`: a new source missing a label is already a compile
 * error, and the list needs no update of its own.
 */
export const SOURCES = Object.keys(SOURCE_LABEL) as Source[];

/**
 * The archives' own front pages — the footer's attribution.
 *
 * Parts of the collection are CC-licensed rather than public domain:
 * Litteraturbanken's freely licensed editions, Perseus's BY-SA files, TCP's
 * CC0 transcriptions. For those, naming the archive and linking to it is the
 * license condition, not a courtesy — the same reason the work link in the
 * collection rests on. The rest are included because an enumeration where the
 * reader has to know which four *must* be there is harder to keep correct
 * than one that includes all of them.
 *
 * The address is the archive's front page, not the reading view: `sourceLink`
 * points at the work, this one at whoever made it available. Perseus
 * therefore gets perseus.tufts.edu, not Scaife, which is only a reader on top
 * of the archive.
 */
export const SOURCE_HOME: Record<Source, string> = {
  gutenberg: "https://www.gutenberg.org",
  litteraturbanken: "https://litteraturbanken.se",
  runeberg: "https://runeberg.org",
  marxists: "https://www.marxists.org",
  perseus: "https://www.perseus.tufts.edu",
  tcp: "https://textcreationpartnership.org",
  dta: "https://www.deutschestextarchiv.de",
  // The portal, not fr.wikisource: the attribution is to the project, and the
  // part of the collection drawn from it is French today but not by definition.
  wikisource: "https://wikisource.org",
};

/**
 * The text's language. Governs chunking's heading detection — "FÖRSTA
 * KAPITLET" and "CHAPTER I" aren't recognized by the same rules — and which
 * question form the local reranking scores the passage against.
 *
 * Since the language branches were added it also governs retrieval itself,
 * and that is the heaviest role: the embedding model splits the vector space
 * by language, so a language without its own branch is a language without
 * hits. See `LANGUAGE_CORPUS` below.
 */
export type Language = "en" | "sv" | "de" | "fr" | "it" | "la";

/**
 * The language's name in Swedish. Goes only to Claude's prompts, never to the
 * UI — hence no English counterpart here and no entry in `i18n.ts`. The
 * prompts are written in Swedish and don't switch language because a reader
 * switched the shell; see the comment at `GENRE_LABEL`.
 */
export const LANGUAGE_LABEL: Record<Language, string> = {
  en: "engelska",
  sv: "svenska",
  fr: "franska",
  de: "tyska",
  la: "latin",
  it: "italienska",
};

/**
 * The collection's languages in order of size — derived from the label table
 * for the same reason as `GENRES`: a new language in `Language` missing a
 * label is already a compile error.
 *
 * The order is the collection's emphasis, not the alphabet's, since it is
 * also the order branches are built and passages are written in. English
 * first: it carries four registers where the others carry one, and that is
 * the order `hypotheticalPassages` relies on.
 */
export const CORPUS_LANGUAGES = Object.keys(LANGUAGE_LABEL) as Language[];

/**
 * The language's name in the UI — its own table, not `LANGUAGE_LABEL`. That
 * table goes only to Claude's prompts and is deliberately single-language,
 * see its comment. The stats page is the only place in the UI where a work's
 * language is shown to the reader, and it follows the same bilingualism as
 * the rest of the shell.
 */
const LANGUAGE_UI_LABEL: Record<Locale, Record<Language, string>> = {
  sv: {
    en: "engelska",
    sv: "svenska",
    de: "tyska",
    fr: "franska",
    it: "italienska",
    la: "latin",
  },
  en: {
    en: "English",
    sv: "Swedish",
    de: "German",
    fr: "French",
    it: "Italian",
    la: "Latin",
  },
};

/** The language as it should read in the stats, in the reader's language. */
export function languageLabel(language: Language, locale: Locale): string {
  return LANGUAGE_UI_LABEL[locale][language] ?? language;
}

/**
 * What the collection actually CARRIES in each language — and this is not decoration.
 *
 * The five non-English languages are not five translations of the same
 * collection but five entirely different selections, drawn from separate
 * archives: the German is Deutsches Textarchiv's idealism, the Latin is
 * Perseus's antiquity, the Italian is essentially Dante. The query expansion
 * writes one hypothetical passage per language, and that passage needs to sit
 * close to what there is to hit — a German passage written as a French
 * 18th-century essay lands in between and hits nothing.
 *
 * The lines go into the prompt and are therefore deliberately short: they
 * should give Claude register and tone, not a catalogue.
 */
export const LANGUAGE_CORPUS: Record<Language, string> = {
  en: "originaltexter och 1800-talsöversättningar, hela bredden",
  sv: "Litteraturbanken och Projekt Runeberg: Strindberg, Almqvist, Lagerlöf, Söderberg, Boye, Södergran, Fröding, Tegnér, Ellen Key, Geijer",
  fr: "Gutenberg: Montesquieu, Rousseau, Voltaire, Tocqueville, Descartes, Pascal, Montaigne",
  de: "Deutsches Textarchiv: Kant, Hegel, Fichte, Schopenhauer, Nietzsche, Goethe, Herder — den tyska idealismen i original",
  la: "Perseus: antik och senantik prosa och dikt i original — Cicero, Seneca, Tacitus, Vergilius, Augustinus",
  it: "Dante och den italienska renässansen",
};

export interface CanonWork {
  /** Stable slug — filename for the raw text and foreign key in the database. */
  id: string;
  source: Source;
  /** The source's own identifier: Gutenberg ID, LB's lbworkid, Runeberg's title key. */
  sourceId: string;
  /** Link to the work at the source. Derived from `sourceId` when the source has fixed URLs. */
  sourceUrl?: string;
  author: string;
  title: string;
  translator?: string;
  genre: Genre;
  language: Language;
  /**
   * The author's year of death (negative = BC), for every source — no
   * generator's catalogue carries a genuine date of composition (see
   * `build-corpus-sv.ts`'s own comment on this same field), so death year
   * is used as a proxy for the work's year across the whole collection.
   * Good enough for periodisation and chronological sorting; never a
   * publication date to cite, and shown in the UI with a "d." prefix for
   * exactly that reason (`year.death` in i18n.ts).
   */
  year: number;
  era: Era;
  /** Substrings ingest checks against the source's own file header. */
  titleMatch: string;
  authorMatch: string;
  /**
   * The pages that make up the work, for sources without their own table of
   * contents. Marxists Internet Archive publishes Gramsci's political
   * writings as fifty separate articles; the list here is the subset that
   * passed the rights check.
   */
  parts?: string[];
}
