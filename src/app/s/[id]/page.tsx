import { notFound } from "next/navigation";
import { cache } from "react";
import { CanonSearch } from "@/app/components/smart-compositions/CanonSearch";
import { PageHeader } from "@/app/components/smart-compositions/PageHeader";
import { RecentSearches } from "@/app/components/smart-compositions/RecentSearches";
import { RecentSearchesProvider } from "@/app/components/providers/RecentSearchesProvider";
import { bcp47, t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { availableFacets } from "@/lib/available";
import { costPayload } from "@/lib/money";
import {
  corpusGrowthSince,
  loadSearch,
  recentSearches,
  type SearchSummary,
} from "@/lib/searches";

/** Empty list rather than a thrown error — a missing archive shouldn't take the answer down with it. */
function readRecent(): SearchSummary[] {
  try {
    return recentSearches(6);
  } catch {
    return [];
  }
}

// `generateMetadata` and the page component both need the same search —
// React's `cache()` de-dupes the two calls within one request, so the row
// (and `hydrate`'s per-passage queries behind it) is read from SQLite once
// instead of twice for every page view.
const cachedLoadSearch = cache(loadSearch);

// Searches live in SQLite and are added while the app is running — the page
// can't be pre-rendered, and a cached version would be wrong as soon as a
// work is re-indexed.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
  const search = cachedLoadSearch(id);
  return {
    title: search
      ? t(locale, "meta.saved", { prompt: search.prompt })
      : t(locale, "meta.missing"),
    description: search?.passages
      .slice(0, 3)
      .map((p) => `${p.author}, ${p.title}`)
      .join(" · "),
  };
}

/**
 * A saved search.
 *
 * The same UI as the home page, but with the answer already in hand: no
 * call to Claude, no waiting. `CanonSearch` starts this page in the "done"
 * phase, so it renders the same as the home page right after a search —
 * no search box, the "recently asked" list in the margin instead. Asking a
 * new question means going back through the link in the header.
 */
export default async function SavedSearchPage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
  const search = cachedLoadSearch(id);

  // Even a search that exists can disappear: the passages it points to are
  // gone if the works have been re-indexed, and `loadSearch` then returns
  // null rather than an empty answer.
  if (!search) notFound();

  const when = new Date(search.createdAt).toLocaleDateString(bcp47(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const recent = readRecent();

  return (
    /* Same grid as the home page, down to the breakpoint: the search box
       that used to fill this column is gone once an answer is on screen
       (see `showSearchBox` in `CanonSearch`), and the margin that held
       nothing on this page now carries the same "recently asked" list the
       home page shows — so the two pages need the same width to hold it. */
    <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-14 px-6 pt-16 pb-12 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_15rem]">
      {/* Same reason as the home page: "Ändra frågan" can start a genuinely
          new search from this page too, and its answer should reach
          "Senast ställda frågor" without a reload — see
          `RecentSearchesProvider`. */}
      <RecentSearchesProvider>
        <main className="min-w-0 max-w-3xl">
          <PageHeader locale={locale} href="/" label={t(locale, "nav.allQuestions")}>
            <p className="mt-2 text-xs text-ink-400">
              {t(locale, "saved.when", { date: when })}
            </p>
          </PageHeader>

          <CanonSearch
            available={availableFacets()}
            initial={{
              prompt: search.prompt,
              // The selection the query was asked of, not an empty one. The
              // page shows an answer that was retrieved from part of the
              // corpus, and the chips should say which part.
              filter: search.filter,
              slug: search.slug,
              passages: search.passages,
              // Opening the link costs nothing — the search has been paid for
              // since the day it ran. The cost line shows zero, and the line
              // items behind it say what that run cost.
              cost: costPayload(search.steps, search.model, {
                cached: true,
                originalUsd: search.cost,
              }),
              // How long the search took the day it ran — 0 for a row saved
              // before this was measured, which `CanonSearch` reads as "no
              // duration to show" rather than as an instant search.
              durationMs: search.durationMs,
              // Opening a permalink never touches `/api/search`, so this is
              // computed here rather than read off a "done" event — see
              // `corpusGrowthSince` in searches.ts.
              corpusGrowth: corpusGrowthSince(search.corpusWorks),
            }}
          />
        </main>

        <aside className="print:hidden lg:sticky lg:top-16 lg:self-start">
          <RecentSearches searches={recent} currentSlug={id} />
        </aside>
      </RecentSearchesProvider>
    </div>
  );
}
