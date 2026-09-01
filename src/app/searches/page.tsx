import { PageHeader } from "../components/smart-compositions/PageHeader";
import { SearchesBrowser } from "../components/smart-compositions/SearchesBrowser";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { allSearches } from "@/lib/searches";

// Searches are added while the app is running — the same reason every
// other page that reads straight from SQLite (`/samling`, `/kostnader`,
// `/projekt`) is force-dynamic.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: t(locale, "meta.searches"),
    description: t(locale, "meta.searchesDescription"),
  };
}

/**
 * Every saved search, filterable — the archive `RecentSearches` only ever
 * shows six rows of, in the page's margin. Until now the only way to a
 * search older than the last six was knowing its permalink already.
 *
 * Reads `allSearches()` once, server-side, and hands the whole list to a
 * client component for the text filter — the same split `/samling` already
 * makes between `CorpusBrowser`'s server-built sections and its own
 * client-side filtering.
 */
export default async function SearchesPage() {
  const locale = await getLocale();
  const searches = allSearches();

  return (
    <main className="mx-auto max-w-3xl px-6 pt-16 pb-12 sm:pb-16">
      <PageHeader
        locale={locale}
        href="/"
        label={t(locale, "nav.search")}
        title={t(locale, "searches.heading")}
      >
        <p className="mt-2 max-w-2xl text-ink-600">
          {t(locale, "searches.intro")}
        </p>
      </PageHeader>

      <SearchesBrowser searches={searches} />
    </main>
  );
}
