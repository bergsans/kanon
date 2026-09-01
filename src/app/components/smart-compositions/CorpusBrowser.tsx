"use client";

import { useMemo, useState } from "react";
import type { Entry, Section, SectionKind } from "@/lib/corpus-view";
import { fold, matches, queryTerms } from "@/lib/fuzzy";
import { eraLabel, genreLabel, SOURCE_LABEL, type Era, type Genre } from "@/lib/taxonomy";
import type { Locale } from "@/lib/i18n";
import { Highlighted } from "../ui/Highlighted";
import { useT } from "../providers/LocaleProvider";

/** The section's heading — genre and era go through their tables, a letter is already the label. */
function sectionLabel(section: Section, locale: Locale): string {
  if (section.kind === "genre") return genreLabel(section.key as Genre, locale);
  if (section.kind === "era") return eraLabel(section.key as Era, locale);
  return section.key;
}

/** The three ways to browse the collection, in the order they appear as tabs. */
const MODES: SectionKind[] = ["genre", "era", "letter"];


/** Dot diameter in px — smallest era still visible, largest stays short of crowding its neighbors. */
const MIN_DOT = 10;
const MAX_DOT = 30;

/**
 * The six eras as a line of dots sized by how many works each holds,
 * chronological left to right.
 *
 * Always built from the full, unfiltered era grouping (`eraSections` as the
 * server sent it) rather than from `filtered` — a timeline that resized
 * while someone typed in the search box would be a distraction, not an
 * overview. Equal spacing between eras, not spacing by year span: the
 * collection has no reliable start year for "antiken" or "medeltid" to
 * measure from, only the ordering — the same reason `ERA_LABEL` names the
 * eras instead of dating them (see `taxonomy.ts`).
 *
 * Two `<ol>`s, not one: the dots sit on a line at a fixed height so they
 * align regardless of size, and the labels below need their own row to wrap
 * without pushing a neighboring dot off the line. Both rows use the same
 * `flex-1` columns, so the two stay aligned.
 */
function EraTimeline({ sections }: { sections: Section[] }) {
  const { t, tn, locale } = useT();
  const maxWorks = useMemo(
    () => Math.max(...sections.map((s) => s.works), 1),
    [sections],
  );

  return (
    <nav aria-label={t("corpus.eraTimeline.ariaLabel")} className="mb-6">
      <div className="relative h-7">
        <div
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-parchment-300"
        />
        <ol className="relative flex h-full items-center">
          {sections.map((section) => {
            const size = MIN_DOT + (MAX_DOT - MIN_DOT) * (section.works / maxWorks);
            return (
              <li key={section.key} className="flex flex-1 justify-center">
                <a
                  href={`#era-${section.key}`}
                  title={`${eraLabel(section.key as Era, locale)} · ${section.works}`}
                >
                  <span
                    aria-hidden
                    className="block rounded-full bg-accent-600/70 ring-4 ring-parchment-0 transition hover:bg-accent-700"
                    style={{ width: size, height: size }}
                  />
                </a>
              </li>
            );
          })}
        </ol>
      </div>
      <ol className="flex">
        {sections.map((section) => (
          <li
            key={section.key}
            className="flex flex-1 flex-col items-center gap-0.5 text-center"
          >
            <a
              href={`#era-${section.key}`}
              className="text-xs text-ink-600 transition hover:text-accent-700"
            >
              {eraLabel(section.key as Era, locale)}
            </a>
            <span className="text-[0.6875rem] text-ink-400">
              {tn("corpus.works", section.works)}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * `/samling` as plain HTML for everything but the search box and the
 * genre/era/author tabs.
 *
 * The server sends all three groupings — `genreSections`, `eraSections`,
 * `letterSections` — pre-sorted (genre and era in their vocabulary's own
 * order, author by first letter). Switching tabs only picks which of the
 * three `sections` points at; nothing is re-grouped or re-sorted on the
 * client. The filter never re-sorts either — it removes rows. An order
 * that jumps with every keystroke is harder to read than the bibliography
 * you've already learned, and "most matches on top" doesn't work here —
 * the name you typed *is* the ranking.
 *
 * The folding is done once per author and title in `folded`, not per
 * keystroke in `filtered`: `fold()` normalizes (NFD) and runs three or four
 * regex substitutions per string, and that cost should be paid when the
 * active grouping changes (once per tab switch), not on every character
 * typed in the box.
 */
export function CorpusBrowser({
  genreSections,
  eraSections,
  letterSections,
}: {
  genreSections: Section[];
  eraSections: Section[];
  letterSections: Section[];
}) {
  const { t, tn, deathYear, locale } = useT();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SectionKind>("genre");

  const sections =
    mode === "genre" ? genreSections : mode === "era" ? eraSections : letterSections;

  const folded = useMemo(
    () =>
      sections.map((section) => ({
        kind: section.kind,
        key: section.key,
        authors: section.authors.map((group) => ({
          author: group.author,
          foldedAuthor: fold(group.author),
          works: group.works.map((work) => ({
            work,
            foldedTitle: fold(work.title),
          })),
        })),
      })),
    [sections],
  );

  const terms = useMemo(() => queryTerms(query), [query]);

  const filtered = useMemo(() => {
    if (terms.length === 0) return sections;

    const result: Section[] = [];
    for (const section of folded) {
      const authors: { author: string; works: Entry[] }[] = [];
      let works = 0;
      for (const group of section.authors) {
        // If the author's name matches, the whole body of work is shown, as
        // in the bibliography; if only a title matches, only those works
        // are shown — otherwise "crime" under "Dostoevsky" would drag along
        // his other ten works.
        const authorHit = matches(terms, group.foldedAuthor);
        const groupWorks = authorHit
          ? group.works.map((w) => w.work)
          : group.works
              .filter((w) => matches(terms, w.foldedTitle))
              .map((w) => w.work);
        if (groupWorks.length === 0) continue;
        authors.push({ author: group.author, works: groupWorks });
        works += groupWorks.length;
      }
      if (authors.length > 0)
        result.push({ kind: section.kind, key: section.key, authors, works });
    }
    return result;
  }, [folded, sections, terms]);

  const totalMatches = useMemo(
    () => filtered.reduce((sum, section) => sum + section.works, 0),
    [filtered],
  );

  return (
    <div>
      <div
        role="tablist"
        aria-label={t("corpus.groupBy.ariaLabel")}
        className="mb-4 flex gap-5 border-b border-parchment-200"
      >
        {/* An accent rule under the active tab, not a filled pill — the
            same "mark, not fill" the header's own view switches carry (see
            `SegmentedControl`): grouping the collection by subject, era, or
            author changes how it's displayed, it isn't a selection within
            it, and a solid accent tab read as one more thing being chosen
            from the corpus rather than a way of looking at all of it. */}
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`cursor-pointer border-b-2 px-1 pb-2 text-sm transition ${
              mode === m
                ? "border-accent-600 font-semibold text-ink-900"
                : "border-transparent text-ink-600 hover:text-accent-700"
            }`}
          >
            {t(`corpus.groupBy.${m}`)}
          </button>
        ))}
      </div>

      {mode === "era" && <EraTimeline sections={eraSections} />}

      <div className="relative">
        {/*
         * `type="search"` draws its own clear button in WebKit and Chromium
         * (`::-webkit-search-cancel-button`) on top of the button below — the
         * same × twice in the same corner. `text` has no such decoration,
         * and the field functions as a search box regardless of what `type`
         * says.
         */}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("corpus.filter.placeholder")}
          aria-label={t("corpus.filter.ariaLabel")}
          className="w-full rounded-lg border border-parchment-300 bg-parchment-0 px-4 py-2.5 text-sm text-ink-900 shadow-sheet outline-none transition placeholder:text-ink-400 focus:border-accent-600 focus:ring-2 focus:ring-accent-600/30"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("corpus.filter.clear")}
            className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-accent-700"
          >
            ×
          </button>
        )}
      </div>

      {terms.length > 0 && (
        <p className="mt-2 text-xs text-ink-400">
          {tn("corpus.filter.matches", totalMatches)}
        </p>
      )}

      {terms.length > 0 && (
        <nav
          aria-label={t("corpus.jump")}
          className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-parchment-200 pt-4 text-sm"
        >
          {filtered.map((section) => (
            <a
              key={`${section.kind}-${section.key}`}
              href={`#${section.kind}-${section.key}`}
              className="text-ink-600 underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
            >
              {sectionLabel(section, locale)}{" "}
              <span className="text-xs text-ink-400">{section.works}</span>
            </a>
          ))}
        </nav>
      )}

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-ink-600">{t("corpus.filter.none")}</p>
      ) : (
        <div className="mt-8 space-y-14">
          {filtered.map((section) => (
            <section
              key={`${section.kind}-${section.key}`}
              id={`${section.kind}-${section.key}`}
              className="scroll-mt-8"
            >
              <h2 className="font-serif text-2xl tracking-tight text-ink-900">
                {sectionLabel(section, locale)}
              </h2>
              <p className="mt-1 text-xs text-ink-400">
                {tn("corpus.works", section.works)} ·{" "}
                {tn("corpus.authors", section.authors.length)}
              </p>

              <div className="mt-5 divide-y divide-parchment-200 border-t border-parchment-200">
                {section.authors.map((group) => (
                  <div
                    key={group.author}
                    className="grid gap-x-8 gap-y-1 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]"
                  >
                    <h3 className="font-serif text-[0.9375rem] leading-snug text-ink-900">
                      <Highlighted text={group.author} terms={terms} />
                    </h3>
                    <ul className="space-y-1.5">
                      {group.works.map((work) => (
                        <li key={work.id} className="text-sm leading-snug text-ink-600">
                          <WorkTitle work={work} terms={terms} />
                          <span className="ml-2 text-xs text-ink-400">
                            {deathYear(work.year)}
                            {work.translator &&
                              ` · ${t("passage.translatedBy", { name: work.translator })}`}
                            {" · "}
                            {SOURCE_LABEL[work.source] ?? work.source}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The title as a link to the source's edition.
 *
 * Litteraturbanken's texts are CC-BY: crediting the source and linking to
 * it is the license condition, not a decoration — the same reasoning as in
 * the results list. If the link is missing (a source without a predictable
 * address), the title stays as plain text; a work shouldn't drop out of the
 * listing just because the address can't be computed.
 */
function WorkTitle({ work, terms }: { work: Entry; terms: string[] }) {
  if (!work.href)
    return (
      <span className="text-ink-800">
        <Highlighted text={work.title} terms={terms} />
      </span>
    );
  return (
    <a
      href={work.href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-ink-800 underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
    >
      <Highlighted text={work.title} terms={terms} />
    </a>
  );
}
