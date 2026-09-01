import type { ReactNode } from "react";
import { costDescription, costLabel, t, tn, type Locale } from "@/lib/i18n";
import { money } from "@/lib/money";
import type { CostBucket, CostStats, UsageStats } from "@/lib/stats";

/**
 * One color per entry — fixed per name rather than per position in the
 * list. The list is sorted by cost and reorders as the bill does; a color
 * tied to position would then change meaning between two visits to the
 * page. A name outside the table (a future entry) falls back to the
 * lightest shade instead of having no color.
 *
 * Alternates hue (rust accent, ink) rather than only lightness within one
 * of them — three same-hue tints sitting edge to edge in a bar were hard to
 * tell apart at a glance, measured by eye against this same page before the
 * change: `frågeexpansion`/`omrankning`/`översättning` were three shades of
 * the same rust, and so were all four line types.
 */
const STEP_COLOR: Record<string, string> = {
  frågeexpansion: "bg-accent-600",
  omrankning: "bg-ink-800",
  översättning: "bg-accent-600/40",
};
const LINE_COLOR: Record<string, string> = {
  inmatning: "bg-accent-600",
  utmatning: "bg-ink-800",
  cacheläsning: "bg-accent-700",
  cacheskrivning: "bg-ink-400",
};
const FALLBACK_COLOR = "bg-ink-600/25";

/**
 * The bill's breakdown as a single shared bar instead of one bar per entry.
 *
 * The old view (one row per entry, width relative to the row's own largest)
 * answers "which entry is biggest". This one answers "how is the krona
 * split up" — a composition, not a comparison — which is the question the
 * page is actually asked: the total is already known, what's missing is
 * where it goes. Every entry therefore always has its own color and its own
 * row in the legend below, never just a sliver of the bar — the color is a
 * shortcut for someone who already knows the entries' names, not the only
 * way to tell them apart.
 */
function CostComposition({
  heading,
  rows,
  kind,
  locale,
  rate,
}: {
  heading: string;
  rows: CostBucket[];
  kind: "step" | "line";
  locale: Locale;
  rate: number;
}) {
  if (rows.length === 0) return null;
  const m = money(locale);
  const total = rows.reduce((sum, r) => sum + r.cost, 0);
  const colors = kind === "step" ? STEP_COLOR : LINE_COLOR;

  return (
    <div className="mt-8 first:mt-0">
      <h3 className="eyebrow">
        {heading}
      </h3>

      <div className="mt-3 flex h-4 gap-0.5 overflow-hidden rounded-full bg-parchment-200">
        {rows.map((row) => (
          <div
            key={row.key}
            className={`h-full first:rounded-l-full last:rounded-r-full ${
              colors[row.key] ?? FALLBACK_COLOR
            }`}
            style={{ width: `${total > 0 ? (row.cost / total) * 100 : 0}%` }}
            title={`${costLabel(locale, kind, row.key)} · ${m.usd(row.cost)}`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-4">
        {rows.map((row) => {
          const share = total > 0 ? Math.round((row.cost / total) * 100) : 0;
          const desc = costDescription(locale, kind, row.key);
          return (
            <li key={row.key} className="flex gap-3">
              <span
                aria-hidden
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  colors[row.key] ?? FALLBACK_COLOR
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm text-ink-600">
                  <span className="font-medium">
                    {costLabel(locale, kind, row.key)}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-ink-400">
                    {m.usd(row.cost)} · {m.sek(row.cost * rate)} · {share}%
                  </span>
                </div>
                {desc && (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-400">
                    {desc}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-ink-400/70">
                  {tn(locale, "costs.tokens", row.tokens)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A bordered tile for one of the three usage figures — moved here from the retired `/statistik` page. */
function StatCard({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-parchment-200 bg-parchment-0 p-5 shadow-sheet">
      <h3 className="eyebrow">
        {heading}
      </h3>
      <div className="mt-3 space-y-1.5">{children}</div>
    </div>
  );
}

/**
 * The bill summed across the entire archive: the same line items a single
 * query's cost box shows (see `CostBreakdown` in `CostTag.tsx`), but summed
 * over every saved search and translation instead of just one.
 *
 * Pure presentation over already-fetched data — `cost`, `usage`, and `rate`
 * are read on the server in `costs/page.tsx` (`costStats`, `usageStats`,
 * `usdSek`, all of which touch the database or `process.env`) and passed
 * down, the same split `ProjectView` makes from `projects/[slug]/page.tsx`.
 * Nothing here calls Claude or the embedding model.
 */
export function CostsOverview({
  locale,
  cost,
  usage,
  rate,
}: {
  locale: Locale;
  cost: CostStats;
  usage: UsageStats;
  rate: number;
}) {
  const m = money(locale);
  const total = cost.byStep.reduce((sum, s) => sum + s.cost, 0);
  const amount = (usd: number) => `${m.usd(usd)} · ${m.sek(usd * rate)}`;

  return (
    <>
      {/* Activity before the bill it produced — how much of the app has
          actually been used, moved up from the retired `/statistik` page to
          sit next to the notion of a cost rather than a page away from it. */}
      <section className="mb-12 grid gap-4 sm:grid-cols-3">
        <StatCard heading={t(locale, "stats.searchesHeading")}>
          {usage.searches === 0 ? (
            <p className="text-sm text-ink-400">{t(locale, "stats.noSearches")}</p>
          ) : (
            <>
              <p className="font-serif text-lg text-ink-900">
                {tn(locale, "stats.searches", usage.searches)}
              </p>
              <p className="text-xs text-ink-400">
                {t(locale, "stats.spent", { amount: amount(usage.spent) })}
              </p>
              {/* Without this line, "6 sparade sökningar · 1,15 kr" reads as
                  an average of ~0,19 kr each — true only if every one of
                  them ran on Claude. A local search is always $0, and
                  saying so here is what makes the figure above honest
                  about what it's an average *of*. */}
              {usage.searches > usage.claudeSearches && (
                <p className="text-xs text-ink-400">
                  {tn(
                    locale,
                    "stats.localSearches",
                    usage.searches - usage.claudeSearches,
                  )}
                </p>
              )}
              {usage.reuses > 0 && (
                <p className="text-xs text-ink-400">
                  {tn(locale, "stats.savedByCache", usage.reuses, {
                    amount: amount(usage.savedByCache),
                  })}
                </p>
              )}
            </>
          )}
        </StatCard>

        <StatCard heading={t(locale, "stats.projectsHeading")}>
          {usage.projects === 0 ? (
            <p className="text-sm text-ink-400">{t(locale, "stats.noProjects")}</p>
          ) : (
            <>
              <p className="font-serif text-lg text-ink-900">
                {tn(locale, "stats.projects", usage.projects)}
              </p>
              <p className="text-xs text-ink-400">
                {tn(locale, "stats.passages", usage.savedPassages)}
              </p>
            </>
          )}
        </StatCard>

        <StatCard heading={t(locale, "stats.translationsHeading")}>
          {usage.translations === 0 ? (
            <p className="text-sm text-ink-400">
              {t(locale, "stats.noTranslations")}
            </p>
          ) : (
            <>
              <p className="font-serif text-lg text-ink-900">
                {tn(locale, "stats.translations", usage.translations)}
              </p>
              <p className="text-xs text-ink-400">
                {t(locale, "stats.spent", {
                  amount: amount(usage.translationCost),
                })}
              </p>
            </>
          )}
        </StatCard>
      </section>

      {cost.byStep.length === 0 ? (
        <p className="rounded border border-accent-600/40 border-l-[3px] border-l-accent-600 bg-accent-600/8 px-3 py-2 text-xs text-accent-700">
          {t(locale, "costs.noData")}
        </p>
      ) : (
        <div className="space-y-10">
          <p className="flex items-baseline justify-between gap-4 border-b border-parchment-300 pb-4 font-serif text-ink-900">
            <span>{t(locale, "costs.total")}</span>
            <span className="font-mono text-lg tabular-nums">
              {m.usd(total)} · {m.sek(total * rate)}
            </span>
          </p>

          <CostComposition
            heading={t(locale, "costs.stepHeading")}
            rows={cost.byStep}
            kind="step"
            locale={locale}
            rate={rate}
          />
          <CostComposition
            heading={t(locale, "costs.lineHeading")}
            rows={cost.byLine}
            kind="line"
            locale={locale}
            rate={rate}
          />
        </div>
      )}
    </>
  );
}
