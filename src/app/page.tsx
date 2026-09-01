import Link from "next/link";
import { HomeSearchShell } from "./components/smart-compositions/HomeSearchShell";
import { RecentSearches } from "./components/smart-compositions/RecentSearches";
import { RecentSearchesProvider } from "./components/providers/RecentSearchesProvider";
import { availableFacets } from "@/lib/available";
import { getDb } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { corpusHref, projectsHref } from "@/lib/routes";
import { recentSearches, type SearchSummary } from "@/lib/searches";
import {
  SOURCE_HOME,
  SOURCE_LABEL,
  SOURCES,
  type Source,
} from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

interface CorpusStats {
  works: number;
  authors: number;
  genres: number;
  sources: Source[];
}

/** Read on the server so the home page shows what's actually indexed. */
function readStats(): CorpusStats | null {
  try {
    const db = getDb();
    const row = db
      .prepare(
        `select count(*) as works, count(distinct author) as authors,
                count(distinct genre) as genres
           from works`,
      )
      .get() as {
      works: number;
      authors: number;
      genres: number;
    };
    if (!row.works) return null;
    // The footer's acknowledgment applies to the texts the app actually
    // serves, so the sources are read from `works`, not the manifest — a
    // work that failed retrieval or the rights check has no archive to
    // thank. The order comes from `SOURCES`, not from the query result: a
    // list that changes order when a work is added reads as if something
    // happened.
    const present = new Set(
      (
        db.prepare("select distinct source from works").all() as {
          source: Source;
        }[]
      ).map((r) => r.source),
    );
    return {
      works: row.works,
      authors: row.authors,
      genres: row.genres,
      sources: SOURCES.filter((source) => present.has(source)),
    };
  } catch {
    return null;
  }
}

/** Empty list before anyone has searched, and before the database even exists. */
function readRecent(): SearchSummary[] {
  try {
    return recentSearches(6);
  } catch {
    return [];
  }
}

export default async function Home() {
  const locale = await getLocale();
  const stats = readStats();
  const recent = readRecent();
  const available = availableFacets();

  return (
    /* Two columns: the reading view on the left at its own line length, the
       archive on the right. The queries used to sit below the footer, where
       they were only seen by someone who'd already scrolled past everything
       else. Up in the right margin they're an entry point instead of an
       afterword. Below lg they fall back below the search box — at that
       width there's no margin to place them in. */
    <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-14 px-6 pt-16 pb-12 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_15rem]">
      {/* Wraps `<main>` and `<aside>` (a live search finishes in one,
          the "Senast ställda frågor" list it should join sits in the
          other) so a completed search can reach that list without a
          reload — see `RecentSearchesProvider`. */}
      <RecentSearchesProvider>
        <main className="min-w-0 max-w-3xl">
          <HomeSearchShell stats={stats} available={available} />
        </main>

        <aside className="print:hidden lg:sticky lg:top-16 lg:self-start">
          <RecentSearches searches={recent} />
        </aside>
      </RecentSearchesProvider>

      {/* The footer is the acknowledgment: who made the texts available,
          and the way there. It stays empty until something is indexed —
          thanking seven archives for zero passages is no thanks at all.
          Its own grid row, spanning both columns, rather than living inside
          `<main>`: nested there, it fell *after* the aside in source order
          only on `lg` — below that breakpoint, where the layout stacks
          instead of sitting side by side, the acknowledgment ended up
          beneath "Senast ställda frågor" instead of closing out the page. */}
      {stats && (
        <footer className="border-t border-parchment-200 pt-6 text-xs leading-relaxed text-ink-400 lg:col-span-2">
          <p className="max-w-2xl">
            {t(locale, "footer.sources")}{" "}
            {stats.sources.map((source, i) => (
              <span key={source}>
                {i > 0 && " · "}
                <a
                  href={SOURCE_HOME[source]}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
                >
                  {SOURCE_LABEL[source]}
                </a>
              </span>
            ))}
          </p>
          {/* Two paths, not one. The corpus is what the app can answer
              from; the projects are what you've kept from the answers,
              and that list is the one page in the app that isn't about
              the canon but about the work of using it. */}
          <p className="mt-2">
            <Link
              href={corpusHref(locale)}
              className="underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
            >
              {t(locale, "footer.corpus")}
            </Link>
            {" · "}
            <Link
              href={projectsHref(locale)}
              className="underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
            >
              {t(locale, "footer.projects")}
            </Link>
          </p>
        </footer>
      )}
    </div>
  );
}
