/**
 * The collection manifest.
 *
 * Ten generated files, one per generator:
 *   corpus.json          Project Gutenberg, the English — `pnpm build-corpus`
 *   corpus-sv.json       Litteraturbanken + Projekt Runeberg — `pnpm build-corpus-sv`
 *   corpus-mia.json      Marxists Internet Archive — `pnpm build-corpus-mia`
 *   corpus-perseus.json  Perseus Digital Library — `pnpm build-corpus-perseus`
 *   corpus-tcp.json      Text Creation Partnership — `pnpm build-corpus-tcp`
 *   corpus-dta.json      Deutsches Textarchiv — `pnpm build-corpus-dta`
 *   corpus-fr.json       Gutenberg's French — `pnpm build-corpus-fr`
 *   corpus-it.json       Gutenberg's Italian — `pnpm build-corpus-it`
 *   corpus-gde.json      Gutenberg's German — `pnpm build-corpus-de`
 *   corpus-ws.json       Wikisource — `pnpm build-corpus-ws`
 *
 * German having two files is not a duplicate: `corpus-dta.json` is Deutsches
 * Textarchiv's first editions and `corpus-gde.json` is Gutenberg's later
 * typesettings, two sources with different rights grounds and different
 * emphasis. The reason is in `scripts/build-corpus-de.ts`.
 *
 * Edit none of them by hand. To change which authors are included, edit the
 * lists at the top of the relevant generator and rerun it.
 *
 * That these are separate files and not one is a deliberate choice, and it's
 * about the *files*, not about sharing code: Gutenberg's CSV catalogue and
 * Litteraturbanken's JSON API have nothing in common, and rebuilding one
 * must not be able to disturb another. Regenerating the Gutenberg portion
 * takes 20 minutes and can move works around if the catalogue has changed
 * upstream — that must not happen as a side effect of adding a Swedish
 * author. The generators do share code now, in `scripts/lib/` — the era
 * boundaries, the duplicate-ID guard, the write-or-`--dry` tail, CSV
 * parsing — because those pieces really were identical across all eight,
 * one of them (Gutenberg's era boundaries) having silently drifted from the
 * rest without anyone noticing. What stays apart is `slug`: each source's
 * naming quirks are tuned separately on purpose, since a shared version
 * edited for one source would reshape IDs everywhere at once.
 */
import gutenbergData from "./corpus.json";
import swedishData from "./corpus-sv.json";
import marxistData from "./corpus-mia.json";
import perseusData from "./corpus-perseus.json";
import tcpData from "./corpus-tcp.json";
import dtaData from "./corpus-dta.json";
import frenchData from "./corpus-fr.json";
import italianData from "./corpus-it.json";
import germanGutenbergData from "./corpus-gde.json";
import wikisourceData from "./corpus-ws.json";

export type { CanonWork, Era, Genre, Language, Source } from "./taxonomy";
export { GENRE_LABEL, SOURCE_LABEL } from "./taxonomy";

import type { CanonWork, Language, Source } from "./taxonomy";
import type { PassageRow } from "./db";
import type { PassagePayload } from "./protocol";

/**
 * The manifest on disk may lack `source`, `sourceId` and `language`: the
 * checked-in corpus.json was generated before those fields existed, and
 * rebuilding it just for three constant values would risk the whole
 * Gutenberg selection needlessly. When missing, the work is a Gutenberg
 * work in English.
 */
interface RawWork extends Omit<CanonWork, "source" | "sourceId" | "language"> {
  source?: Source;
  sourceId?: string;
  language?: Language;
  /** The field name in the older Gutenberg form. */
  gutenbergId?: number;
}

/**
 * The same person, filed under a shorter name form in one source than in
 * another — confirmed against every manifest by
 * `scripts/.probe-author-collisions.ts` (read-only, changes nothing): Hegel,
 * Nietzsche, Lessing, Goethe and Winckelmann appear as an
 * abbreviated German catalog form in DTA/Gutenberg's German section
 * ("G. W. F. Hegel") and as the full name in Gutenberg's English section
 * ("Georg Wilhelm Friedrich Hegel"); Seneca appears as a bare name in
 * Perseus and with his full Roman name in Gutenberg. Two spellings of one
 * person means two names in `diversify()`'s author cap (`search.ts`), which
 * counts on the string and so never catches the two forms as the same
 * writer, and two headings for one person on `/samling`.
 *
 * A short, explicit table of the ~6 known cases, not a general name
 * unifier — the collection has real distinct people sharing a surname
 * (the Brontë sisters, the Humboldt brothers, the James brothers, John
 * Stuart Mill and Harriet Taylor Mill), and nothing short of a hand-checked
 * list can tell "the same person, two catalogs" from "two people, one
 * surname."
 *
 * Deliberately only touches the *display* name. `id` is built from the
 * source's own slug at ingest time and identifies the row in the database;
 * `authorMatch` is checked against the source file's own header, not a
 * catalog (see AGENTS.md on why it must never be). Changing either here
 * would either orphan already-indexed rows or break the rights check this
 * table has nothing to do with.
 */
export const DISPLAY_AUTHOR: Record<string, string> = {
  "G. W. F. Hegel": "Georg Wilhelm Friedrich Hegel",
  "Friedrich Nietzsche": "Friedrich Wilhelm Nietzsche",
  "G. E. Lessing": "Gotthold Ephraim Lessing",
  "J. W. von Goethe": "Johann Wolfgang von Goethe",
  "J. J. Winckelmann": "Johann Joachim Winckelmann",
  Seneca: "Lucius Annaeus Seneca",
};

/**
 * Genre is assigned once per author in every generator (`author.genre` in
 * `build-corpus-lang.ts`, the Gutenberg entries in `build-corpus.ts`) and
 * stamped onto every one of that author's works — true for 509 of 515
 * authors, but not these: Montesquieu and Constant wrote both political
 * treatises and novels, and Hobhouse's *Liberalism* is political theory
 * classed as anthropology only because Hobhouse's *other* Gutenberg works
 * are. Keyed by `id`, not by title — the same reason `DISPLAY_AUTHOR` above
 * is keyed by the exact string, not a fuzzy match: a table anyone can read
 * and verify against the manifest beats a rule that might silently catch
 * the wrong row.
 *
 * A generator-level fix (`author.genre` per title, in
 * `build-corpus-lang.ts`) was considered and set aside: that file is shared
 * by the French *and* Italian generators, and reworking its per-author
 * model for three titles risked far more than it fixed. `id` is untouched
 * either way, so nothing here can orphan an indexed row.
 */
const GENRE_OVERRIDE: Record<string, CanonWork["genre"]> = {
  "fr-montesquieu-lettres-persanes-tome-i-30268": "prosa",
  "fr-montesquieu-lettres-persanes-tome-ii-33856": "prosa",
  // A pastoral prose allegory, not the political theory the rest of
  // Montesquieu's entries correctly are.
  "fr-montesquieu-le-temple-de-gnide-24260": "prosa",
  "fr-benjamin-constant-adolphe-13861": "prosa",
  "fr-benjamin-constant-adolphe-anecdote-trouvee-dans-les-papier-28078": "prosa",
  "hobhouse-liberalism": "politik",
};

/**
 * One Gutenberg record's title runs on past a truncated word — "…et de
 * l'us" — the catalog entry itself, not a parsing bug on this side; the
 * shorter title is Gutenberg's own alternate record for the same edition.
 * Fixed here rather than attempting the wider cleanup of every "(of 8)" and
 * "[1889]"-style catalog marker across the collection: most of those are
 * Gutenberg's own, deliberate way of distinguishing volumes of the same
 * work and removing them would make Montaigne's four volumes read as the
 * same title four times, not less noisy.
 */
const TITLE_OVERRIDE: Record<string, string> = {
  "fr-benjamin-constant-adolphe-anecdote-trouvee-dans-les-papier-28078":
    "Adolphe : Anecdote trouvée dans les papiers d'un inconnu",
};

/**
 * This is where `DISPLAY_AUTHOR`, `GENRE_OVERRIDE` and `TITLE_OVERRIDE`
 * above take effect in `CORPUS` — but `CORPUS` itself is only the manifest
 * in memory. `/samling` and every search result read `author`/`genre`/
 * `title` off the `works` *table* instead (see `readEntries` in
 * `app/collection/page.tsx`, and the `select ... from works` in
 * `search.ts`), which keeps its own copy written at ingest time. A change
 * here is invisible anywhere in the running app until `pnpm ingest
 * --limit=0` runs `syncMetadata()` (`scripts/ingest.ts`) and copies the
 * corrected fields into that table — seconds, no re-indexing.
 */
function normalize(raw: RawWork[]): CanonWork[] {
  return raw.map((w) => ({
    ...w,
    source: w.source ?? "gutenberg",
    sourceId: w.sourceId ?? String(w.gutenbergId ?? ""),
    language: w.language ?? "en",
    author: DISPLAY_AUTHOR[w.author] ?? w.author,
    genre: GENRE_OVERRIDE[w.id] ?? w.genre,
    title: TITLE_OVERRIDE[w.id] ?? w.title,
  }));
}

export const CORPUS: CanonWork[] = [
  ...normalize(gutenbergData as RawWork[]),
  ...normalize(swedishData as RawWork[]),
  ...normalize(marxistData as RawWork[]),
  ...normalize(perseusData as RawWork[]),
  ...normalize(tcpData as RawWork[]),
  ...normalize(dtaData as RawWork[]),
  ...normalize(frenchData as RawWork[]),
  ...normalize(italianData as RawWork[]),
  ...normalize(germanGutenbergData as RawWork[]),
  ...normalize(wikisourceData as RawWork[]),
];

export const WORK_BY_ID = new Map(CORPUS.map((w) => [w.id, w]));

/**
 * Link to the work at the source.
 *
 * Litteraturbanken's addresses can't be computed from lbworkid — they carry
 * both the author's and the work's own path — so the generator writes them
 * into the manifest directly. Gutenberg and Runeberg have predictable addresses.
 *
 * Wikisource also writes in its address, but for a different reason: the
 * hostname is the language's (fr.wikisource.org), and the language lives on
 * the work and not in the three fields this function gets to see. Widening
 * the signature for one source would make the link-building depend on
 * fields no other branch needs.
 */
export function sourceLink(
  w: Pick<CanonWork, "source" | "sourceId" | "sourceUrl">,
): string | null {
  if (w.sourceUrl) return w.sourceUrl;
  if (!w.sourceId) return null;
  switch (w.source) {
    case "gutenberg":
      return `https://www.gutenberg.org/ebooks/${w.sourceId}`;
    case "runeberg":
      return `https://runeberg.org/${w.sourceId}/`;
    case "marxists":
      return `https://www.marxists.org${w.sourceId}`;
    case "perseus":
      // Scaife, Perseus's own reader, takes the CTS URN directly as the address.
      return `https://scaife.perseus.org/reader/${w.sourceId}/`;
    case "tcp":
      // Quod is Michigan's reading view, the only durable address for a TCP text.
      return `https://quod.lib.umich.edu/e/eebo/${w.sourceId}.0001.001`;
    case "dta":
      return `https://www.deutschestextarchiv.de/book/show/${w.sourceId}`;
    default:
      return null;
  }
}

/**
 * The source link for a passage, from its work in the manifest.
 *
 * The fallback is for a work that is still indexed but has since left the
 * manifest: the row in `works` outlives the line in the generator until the
 * next ingest, and such a passage should render without a link rather than
 * not at all.
 */
export function passageSourceUrl(p: {
  workId: string;
  source: Source;
}): string | null {
  return sourceLink(WORK_BY_ID.get(p.workId) ?? { source: p.source, sourceId: "" });
}

/**
 * A passage row as it goes out on the wire.
 *
 * The fields are picked one by one, not spread: the stream builds this from
 * a `Candidate`, which also carries fusion scores, character offsets and
 * branch names, and none of that belongs in the payload a permalink saves
 * the shape of. The stream and the permalink share this function so the two
 * can't show the same answer in two shapes.
 */
export function toPassagePayload(
  row: PassageRow,
  relevance: string,
  index: number,
): PassagePayload {
  return {
    index,
    chunkId: row.chunkId,
    workId: row.workId,
    author: row.author,
    title: row.title,
    translator: row.translator,
    genre: row.genre,
    language: row.language,
    source: row.source,
    year: row.year,
    locator: row.locator,
    text: row.text,
    relevance,
    sourceUrl: passageSourceUrl(row),
  };
}
