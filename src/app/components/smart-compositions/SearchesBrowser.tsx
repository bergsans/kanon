"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fold, queryTerms, matches } from "@/lib/fuzzy";
import { bcp47 } from "@/lib/i18n";
import { money } from "@/lib/money";
import { isClaudeModelName } from "@/lib/provider";
import type { SearchSummary } from "@/lib/searches";
import { describeFilter, isFiltered } from "@/lib/taxonomy";
import { ChipRow } from "../ui/ChipRow";
import { Highlighted } from "../ui/Highlighted";
import { useCostEstimate } from "../providers/CostEstimateProvider";
import { useT } from "../providers/LocaleProvider";

/**
 * Every saved search, filterable by question text and by model.
 *
 * The register list, not a table: the same `divide-y` rows `/samling` and
 * `/projekt`'s own list already use, so a third archive in the app reads as
 * the same kind of page rather than a new shape to learn.
 *
 * No explicit grouping of the same question asked of several models —
 * considered, and left to the text filter instead: typing the question
 * already pulls every run of it together, without a second sort key that
 * would fight the otherwise newest-first order everyone opening an archive
 * expects.
 */
export function SearchesBrowser({ searches }: { searches: SearchSummary[] }) {
  const { t, tn, locale } = useT();
  // The same server-computed rate `CostTag` converts with — see
  // `CostEstimateProvider` — so a search's krona figure here always agrees
  // with what it showed the day it ran.
  const { rate } = useCostEstimate();
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<string[]>([]);

  // Only the models actually present get a chip — an entry for a model
  // with zero saved searches isn't a choice, the same reasoning `SearchBox`
  // applies to an axis with only one value.
  const modelOptions = useMemo(
    () => [...new Set(searches.map((s) => s.model))].sort(),
    [searches],
  );

  const folded = useMemo(
    () => searches.map((s) => ({ search: s, foldedPrompt: fold(s.prompt) })),
    [searches],
  );
  const terms = useMemo(() => queryTerms(query), [query]);

  const filtered = useMemo(() => {
    return folded
      .filter(({ search }) => models.length === 0 || models.includes(search.model))
      .filter(({ foldedPrompt }) => matches(terms, foldedPrompt))
      .map(({ search }) => search);
  }, [folded, models, terms]);

  const m = money(locale);

  return (
    <div className="mt-10">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searches.filter.placeholder")}
          aria-label={t("searches.filter.ariaLabel")}
          /* A solid border on focus, not a translucent ring — the style
             `SearchBox`'s own comment argues against, and `CorpusBrowser`'s
             filter field is listed in Known issues for using anyway. New
             code gets the resolved pattern, not the flagged one. */
          className="w-full rounded-lg border border-parchment-300 bg-parchment-0 px-4 py-2.5 text-sm text-ink-900 shadow-sheet outline-none transition placeholder:text-ink-400 focus:border-2 focus:border-accent-600"
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

      {modelOptions.length > 1 && (
        <div className="mt-3 border-t border-parchment-200 py-3">
          <ChipRow
            label={t("searches.modelFilter.label")}
            allLabel={t("searches.modelFilter.all")}
            options={modelOptions}
            selected={models}
            onChange={setModels}
            busy={false}
            labelOf={(model) => model}
          />
        </div>
      )}

      <p className="mt-4 text-xs text-ink-400">
        {tn("stats.searches", filtered.length)}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-ink-600">{t("searches.filter.none")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-parchment-200 border-t-2 border-accent-600">
          {filtered.map((s) => {
            const when = new Date(s.createdAt).toLocaleDateString(bcp47(locale), {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            return (
              <li key={s.slug} className="py-3">
                <Link
                  href={`/s/${s.slug}`}
                  className="block font-serif text-base leading-snug text-ink-900 transition hover:text-accent-700"
                >
                  <Highlighted text={s.prompt} terms={terms} />
                </Link>
                <p className="mt-0.5 text-xs text-ink-400">
                  {when}
                  {" · "}
                  <span className="whitespace-nowrap font-mono">{s.model}</span>
                  {" · "}
                  {tn("recent.count", s.passageCount)}
                  {" · "}
                  {/* The model name is already on this row, so — unlike
                      `CostTag`'s "lokal modell · kostar ingenting" — this
                      only needs the second half: repeating "lokal modell"
                      right next to the model's own name would say the same
                      thing twice. */}
                  {isClaudeModelName(s.model) ? (
                    <span className="font-mono">
                      {m.usd(s.cost)} · {m.sek(s.cost * rate)}
                    </span>
                  ) : (
                    t("cost.free")
                  )}
                  {isFiltered(s.filter) && (
                    <>
                      {" · "}
                      {t("subjects.selected", { list: describeFilter(s.filter, locale) })}
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
