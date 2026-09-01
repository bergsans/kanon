"use client";

import { money } from "@/lib/money";
import type { ExternalHit } from "@/lib/protocol";
import { useT } from "../providers/LocaleProvider";

/**
 * The result of the "utanför samlingen" checkbox — see `findExternal` in
 * claude.ts and the "external" event in protocol.ts.
 *
 * Deliberately its own section, never merged into the passages list above
 * it: a hit here is a pointer to a page this app has no proven right to
 * quote, not a member of the collection. The border is ink-400, not the
 * accent — the same neutral register `CanonSearch`'s "declined" box uses —
 * so the eye reads "a different kind of result" before reading a word of
 * it, the way the accent border on the passages list reads "the collection
 * answered" before any passage is read.
 */
export function ExternalSources({
  hits,
  loading,
  cost,
}: {
  /** `null` before the step has ever run for the search on screen. */
  hits: ExternalHit[] | null;
  loading: boolean;
  /** The step's own cost — always real, never a cache hit. `null` until it arrives. */
  cost: { usd: number; rate: number } | null;
}) {
  const { t, locale } = useT();
  const m = money(locale);

  // Nothing to show: the checkbox was never on for this search.
  if (!loading && hits === null) return null;

  return (
    <section className="space-y-3 border-t-2 border-ink-400 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="eyebrow eyebrow-rule flex-1">
          {t("external.heading")}
        </h2>
        {cost && (
          <span className="font-mono text-xs tabular-nums text-ink-400">
            {t("external.cost", {
              amount: `${m.usd(cost.usd)} · ${m.sek(cost.usd * cost.rate)}`,
            })}
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-ink-400">
        {t("external.explain")}
      </p>

      {loading && (
        <p
          className="flex items-center gap-2 text-sm text-ink-400"
          role="status"
        >
          <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-ink-400 motion-reduce:animate-none" />
          {t("external.loading")}
        </p>
      )}

      {!loading && hits && hits.length === 0 && (
        <p className="text-sm text-ink-400">{t("external.empty")}</p>
      )}

      {!loading && hits && hits.length > 0 && (
        <ul className="divide-y divide-parchment-200">
          {hits.map((hit) => (
            <li key={hit.url} className="py-3">
              <a
                href={hit.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-serif text-base text-ink-900 underline decoration-parchment-300 decoration-dotted underline-offset-4 transition hover:text-accent-700 hover:decoration-accent-600"
              >
                {hit.author}, {hit.title}
              </a>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                {hit.relevance}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-ink-400">
                {hit.url}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
