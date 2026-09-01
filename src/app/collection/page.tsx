import { CorpusBrowser } from "../components/smart-compositions/CorpusBrowser";
import { PageHeader } from "../components/smart-compositions/PageHeader";
import type { Entry, Section, SectionKind } from "@/lib/corpus-view";
import { sourceLink, WORK_BY_ID } from "@/lib/corpus";
import { getDb } from "@/lib/db";
import { bcp47, formatNumber, t, tn, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { collectionStats, type CollectionStats } from "@/lib/stats";
import {
  ERAS,
  eraLabel,
  GENRES,
  genreLabel,
  languageLabel,
  SOURCE_LABEL,
  type Era,
  type Genre,
  type Source,
} from "@/lib/taxonomy";

// Works are added while the app is running — an overnight ingest run should
// show up in the list the next morning without anyone rebuilding the app.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: t(locale, "meta.corpus"),
    description: t(locale, "meta.corpusDescription"),
  };
}

interface Row {
  id: string;
  author: string;
  title: string;
  translator: string | null;
  year: number;
  genre: Genre;
  era: Era;
  source: Source;
  sourceId: string;
}

/**
 * Works are read from the database, not from the manifest.
 *
 * The manifest is the wish list: it contains works that never made it
 * through retrieval, the rights check, or chunking. The page states what
 * the corpus *is*, and the only place that knows that is `works` — a row
 * exists there only once the work has indexed passages behind it. The link
 * is still fetched from the manifest, since Litteraturbanken's addresses
 * can't be computed from their lbworkid.
 *
 * `href` is resolved here and not in the client filter: the filter is a
 * client component for the search box's sake, and the manifest — all ten
 * source files, for all ~2,690 works — shouldn't ride along in that bundle
 * just because a link needs computing.
 */
function readEntries(): Entry[] {
  // No try/catch here on purpose. A genuinely empty collection (a fresh
  // clone, before `pnpm ingest` has ever run) doesn't throw at all — the
  // query below simply returns no rows, which is exactly what
  // `entries.length === 0` below reads as "run pnpm ingest". Catching every
  // error and folding it into that same empty state used to make a locked
  // or corrupt database show the same "not indexed" message as a fresh
  // install — the wrong instruction for the actual problem. Left
  // unguarded, a real error propagates past this Server Component to
  // `error.tsx`, which shows "something broke, try again" instead.
  const db = getDb();
  const rows = db
    .prepare(
      `select id, author, title, translator, year, genre, era, source,
              source_id as sourceId
         from works`,
    )
    .all() as Row[];
  return rows.map((row) => ({
    ...row,
    href: sourceLink(WORK_BY_ID.get(row.id) ?? row),
  }));
}

/**
 * One grouping key, then author name — and the name as it stands, not
 * surname first.
 *
 * A bibliography normally sorts by surname, but the corpus has Homer, the
 * Bible, and the Kalevala with no surname at all, and "Erasmus of
 * Rotterdam", "Thomas Aquinas", and "Gustaf af Geijerstam" break every rule
 * you could write to extract one. The full name is also what appears in the
 * results list; sorting by something the reader doesn't see would hide the
 * ordering.
 *
 * `localeCompare`, not SQL's `order by`: SQLite compares byte by byte, which
 * puts Émile Zola and Söderberg after Xenophon. The collation follows the
 * reader's language — Swedish sorts Ö last, English sorts it in among the
 * O's.
 *
 * `keyOrder` fixes the section order for genre and era, where the
 * vocabulary itself has a meaningful order (chronological, for eras). Left
 * unset, the keys sort with the same collator as everything else — the
 * right choice once the "key" is a letter and has no order but the
 * alphabet's.
 */
function buildSections(
  entries: Entry[],
  locale: Locale,
  kind: SectionKind,
  keyOf: (entry: Entry) => string,
  keyOrder?: readonly string[],
): Section[] {
  const collator = new Intl.Collator(bcp47(locale));
  const byKey = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(entry);
    else byKey.set(key, [entry]);
  }

  // A key with no indexed works gets no heading. The manifest may have
  // works in it; the page only shows what's actually searchable.
  const keys = keyOrder
    ? keyOrder.filter((key) => byKey.has(key))
    : [...byKey.keys()].sort((a, b) => collator.compare(a, b));

  return keys.map((key) => {
    const works = byKey.get(key)!;
    const byAuthor = new Map<string, Entry[]>();
    for (const work of works) {
      const bucket = byAuthor.get(work.author);
      if (bucket) bucket.push(work);
      else byAuthor.set(work.author, [work]);
    }

    const authors = [...byAuthor.entries()]
      .map(([author, list]) => ({
        author,
        // Chronological within each author's body of work, since that's the
        // order a work is referenced in — with the title as tiebreaker
        // between the many works that share a death year on Gutenberg.
        works: list.sort(
          (a, b) => a.year - b.year || collator.compare(a.title, b.title),
        ),
      }))
      .sort((a, b) => collator.compare(a.author, b.author));

    return { kind, key, authors, works: works.length };
  });
}

function genreSections(entries: Entry[], locale: Locale): Section[] {
  return buildSections(entries, locale, "genre", (e) => e.genre, GENRES);
}

function eraSections(entries: Entry[], locale: Locale): Section[] {
  return buildSections(entries, locale, "era", (e) => e.era, ERAS);
}

/** The author's first character, uppercased — the grouping key for the "browse by author" mode. */
function firstLetter(name: string, locale: Locale): string {
  const char = [...name.trim()][0];
  return char ? char.toLocaleUpperCase(bcp47(locale)) : "?";
}

function letterSections(entries: Entry[], locale: Locale): Section[] {
  return buildSections(entries, locale, "letter", (e) =>
    firstLetter(e.author, locale),
  );
}

/** The sources with their counts, in descending order — the corpus's center of gravity becomes visible. */
function bySource(entries: Entry[]): { source: Source; works: number }[] {
  const counts = new Map<Source, number>();
  for (const entry of entries) {
    counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([source, works]) => ({ source, works }))
    .sort((a, b) => b.works - a.works);
}

/**
 * Distinct swatches for a stacked bar, all drawn from the app's two hues
 * (rust accent, ink) rather than from lightness steps within one of them.
 * Three same-hue tints sitting edge to edge in a bar are hard to tell apart
 * at a glance — the app's own `/kostnader` composition had exactly that
 * problem — so this alternates hue *and* weight instead of only weight.
 * Indexed by position in `collection.byLanguage`, which `collectionStats`
 * already returns sorted by size: the largest segment (English, three
 * quarters of the corpus) always gets the first, strongest swatch.
 */
const LANGUAGE_SWATCH = [
  "bg-accent-600",
  "bg-ink-800",
  "bg-accent-600/50",
  "bg-ink-400",
  "bg-accent-700",
  "bg-ink-600/60",
];

/**
 * The collection's languages as one bar, proportioned by share rather than
 * as a list of counts next to each other — the same "composition, not
 * comparison" reasoning `/kostnader`'s `CostComposition` uses for the bill.
 * The question here is "how is the collection split", and a single bar
 * answers it at a glance in a way six separate numbers don't.
 */
function LanguageBar({
  collection,
  locale,
}: {
  collection: CollectionStats;
  locale: Locale;
}) {
  const total = collection.byLanguage.reduce((sum, c) => sum + c.works, 0);
  if (total === 0) return null;

  return (
    <div className="mt-3">
      <h3 className="text-xs text-ink-400">
        {t(locale, "stats.languagesHeading")}
      </h3>
      <div className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full bg-parchment-200">
        {collection.byLanguage.map((c, i) => (
          <div
            key={c.key}
            className={`h-full first:rounded-l-full last:rounded-r-full ${LANGUAGE_SWATCH[i % LANGUAGE_SWATCH.length]}`}
            style={{ width: `${(c.works / total) * 100}%` }}
            title={`${languageLabel(c.key, locale)} · ${tn(locale, "corpus.works", c.works)}`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        {collection.byLanguage.map((c, i) => (
          <li key={c.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${LANGUAGE_SWATCH[i % LANGUAGE_SWATCH.length]}`}
            />
            {languageLabel(c.key, locale)}{" "}
            <span className="text-ink-400">
              {Math.round((c.works / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The eras as plain relative bars — one row each, width relative to the largest era. */
function EraBars({
  collection,
  locale,
}: {
  collection: CollectionStats;
  locale: Locale;
}) {
  if (collection.byEra.length === 0) return null;
  const max = Math.max(...collection.byEra.map((c) => c.works));

  return (
    <div className="mt-5">
      <h3 className="text-xs text-ink-400">{t(locale, "stats.erasHeading")}</h3>
      <ul className="mt-2 space-y-2">
        {collection.byEra.map((c) => (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm text-ink-600">
              <span>{eraLabel(c.key, locale)}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-400">
                {tn(locale, "corpus.works", c.works)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-parchment-200">
              <div
                className="h-full rounded-full bg-accent-600"
                style={{ width: `${(c.works / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The whole corpus on one page.
 *
 * A search shows ten to sixteen passages and says nothing about what it
 * chose *from*. That question — what does this corpus actually contain, and
 * who made the text available — is only answered by a complete listing.
 *
 * The page is essentially static, but the filter (`CorpusBrowser`) is a
 * client component and receives the same `list` the HTML is built from — it
 * therefore ships a second time as data in the page's RSC payload. What
 * that costs in the production build hasn't been measured (see README,
 * "The corpus as a page"): the old figure, 1.8 MB / 148 kB over the wire at
 * 1,674 works, was for the page without the filter.
 */
export default async function CorpusPage() {
  const locale = await getLocale();
  const entries = readEntries();
  const genreList = genreSections(entries, locale);
  const eraList = eraSections(entries, locale);
  const letterList = letterSections(entries, locale);
  const authors = new Set(entries.map((e) => e.author)).size;
  // `works` carries no `language` column in `readEntries`'s own select, so
  // the distribution below is read separately — `collectionStats` is the
  // same free, indexed-only read `/kostnader`'s usage figures come from.
  const collection = collectionStats();

  return (
    <main className="mx-auto max-w-3xl px-6 pt-16 pb-12 sm:pb-16">
      <PageHeader
        locale={locale}
        href="/"
        label={t(locale, "nav.search")}
        title={t(locale, "corpus.heading")}
      >
        {entries.length === 0 ? (
          <p className="mt-3 rounded border border-accent-600/40 border-l-[3px] border-l-accent-600 bg-accent-600/8 px-3 py-2 text-xs text-accent-700">
            {t(locale, "home.notIndexedBefore")}{" "}
            <code className="font-mono">pnpm ingest</code>{" "}
            {t(locale, "home.notIndexedAfter")}
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-2xl text-ink-600">
              {t(locale, "corpus.intro")}
            </p>
            <p className="mt-3 text-xs text-ink-400">
              {t(locale, "corpus.totals", {
                works: formatNumber(entries.length, locale),
                authors: formatNumber(authors, locale),
              })}
            </p>

            {/* Language first, and as one bar rather than a list of counts:
                the collection is three-quarters English while the question
                asked of it is Swedish, and that gap is the app's central
                tension — README calls it "the app's entire tension" — not a
                fact that should wait behind eras and sources to be
                noticed. Era stays alongside it as a plain relative reading:
                this used to be `/statistik`'s whole page; the two facts
                that page carried and this one didn't (era and language)
                move up here, next to the totals they belong to, instead of
                living a click away on a page of their own. */}
            <section className="mt-8">
              <h2 className="eyebrow">
                {t(locale, "corpus.distributionHeading")}
              </h2>
              <LanguageBar collection={collection} locale={locale} />
              <EraBars collection={collection} locale={locale} />
            </section>

            {/* The sources on their own: five archives have made the texts
                available, and which one carries which part of the corpus
                is information in itself. */}
            <section className="mt-6">
              <h2 className="eyebrow">
                {t(locale, "corpus.sourcesHeading")}
              </h2>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-600">
                {bySource(entries).map(({ source, works }) => (
                  <li key={source}>
                    {SOURCE_LABEL[source] ?? source}{" "}
                    <span className="text-xs text-ink-400">
                      {tn(locale, "corpus.works", works)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Direct links to each genre heading further down the page —
                the same anchors `CorpusBrowser` already sets on every
                `<section id=…>`, and therefore available without typing
                anything into the filter. */}
            <section className="mt-4">
              <h2 className="eyebrow">
                {t(locale, "corpus.genresHeading")}
              </h2>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-600">
                {genreList.map((section) => (
                  <li key={section.key}>
                    <a
                      href={`#genre-${section.key}`}
                      className="underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
                    >
                      {genreLabel(section.key as Genre, locale)}
                    </a>{" "}
                    <span className="text-xs text-ink-400">
                      {tn(locale, "corpus.works", section.works)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </PageHeader>

      {entries.length > 0 && (
        <CorpusBrowser
          genreSections={genreList}
          eraSections={eraList}
          letterSections={letterList}
        />
      )}

      {entries.length > 0 && (
        <footer className="mt-16 border-t border-parchment-200 pt-6 text-xs leading-relaxed text-ink-400">
          {/* The year appears in every row and doesn't mean the same thing
              in all of them. Spelling that out is the same honesty
              `citation.ts` shows when it keeps the year out of the
              reference. */}
          <p className="max-w-2xl">{t(locale, "corpus.yearNote")}</p>
        </footer>
      )}
    </main>
  );
}
