import { CostsOverview } from "../components/smart-compositions/CostsOverview";
import { PageHeader } from "../components/smart-compositions/PageHeader";
import { costStats, usageStats } from "@/lib/stats";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { usdSek } from "@/lib/money";

// Same reason as the stats page: the bill changes every time someone
// searches or translates a passage.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: t(locale, "meta.costs"),
    description: t(locale, "meta.costsDescription"),
  };
}

/**
 * The bill summed across the entire archive: the same line items a single
 * query's cost box shows (see `CostBreakdown` in `CostTag.tsx`), but summed
 * over every saved search and translation instead of just one.
 *
 * Nothing here calls Claude or the embedding model — see `costStats` in
 * `src/lib/stats.ts`, which only reads `cost_detail` from already-saved rows.
 * The rendering itself lives in `CostsOverview`, a pure presentational
 * component so it can carry its own Storybook story — the same split
 * `ProjectView` makes from `projects/[slug]/page.tsx`.
 */
export default async function CostsPage() {
  const locale = await getLocale();
  const cost = costStats();
  const usage = usageStats();
  const rate = usdSek();

  return (
    <main className="mx-auto max-w-3xl px-6 pt-16 pb-12 sm:pb-16">
      <PageHeader
        locale={locale}
        href="/"
        label={t(locale, "nav.search")}
        title={t(locale, "costs.heading")}
      >
        <p className="mt-4 max-w-xl text-ink-600">{t(locale, "costs.intro")}</p>
      </PageHeader>

      <CostsOverview locale={locale} cost={cost} usage={usage} rate={rate} />
    </main>
  );
}
