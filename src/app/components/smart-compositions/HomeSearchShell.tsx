"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { corpusHref } from "@/lib/routes";
import type { CorpusFacets } from "@/lib/taxonomy";
import { CanonSearch, type CanonSearchHandle } from "./CanonSearch";
import { useT } from "../providers/LocaleProvider";
import { LocaleSwitch } from "./LocaleSwitch";
import { PageHeader } from "./PageHeader";
import { TextSizeSwitch } from "../ui/TextSizeSwitch";

interface CorpusStats {
  works: number;
  authors: number;
  genres: number;
}

/**
 * The front page's masthead and its search session, as one client component.
 *
 * The two used to be independent: a server-rendered header above a
 * client-rendered `CanonSearch`. That worked fine until an answer landed —
 * the big wordmark, the introduction paragraph, and the corpus count stayed
 * in place exactly as they'd been before anything was asked, while the
 * *same* answer opened at its own permalink (`/s/[id]`) got the compact
 * header every other page in the app uses. A reload after searching and a
 * fresh search landed on two different layouts for the same content.
 *
 * `active` mirrors `CanonSearch`'s own `showResults` (`phase !== "idle"`),
 * reported up through `onActiveChange` — the state itself stays inside
 * `CanonSearch`, this component only ever reads whether it's idle or not.
 * Once true it stays true even while the question is reopened for editing:
 * the masthead shouldn't spring back open underneath an answer that's
 * merely being refined, only underneath a session that hasn't asked
 * anything yet.
 */
export function HomeSearchShell({
  stats,
  available,
}: {
  stats: CorpusStats | null;
  available: CorpusFacets;
}) {
  const { t, num, locale } = useT();
  const [active, setActive] = useState(false);
  const searchRef = useRef<CanonSearchHandle>(null);

  return (
    <>
      {active ? (
        /* The same compact header `/s/[id]`, `/samling`, `/projekt` and
           `/kostnader` all use — wordmark, arrow, "back to search" label,
           the two reading-preference switches. No date line: that one is
           `saved.when` on the permalink page, for a search that's actually
           been saved and reopened, not a live session still on screen.
           `onClick` resets the search directly: this link's `href` is the
           route already mounted, so Next's own navigation has nothing to
           remount and the answer below would otherwise just sit there. */
        <PageHeader
          locale={locale}
          href="/"
          label={t("nav.allQuestions")}
          onClick={() => searchRef.current?.reset()}
        />
      ) : (
        <header className="mb-10">
          <div className="flex items-start justify-between gap-6">
            <h1 className="font-serif text-4xl tracking-tight text-ink-900 sm:text-5xl">
              {t("app.name")}
            </h1>
            <div className="mt-1 flex shrink-0 items-center gap-4 print:hidden">
              <TextSizeSwitch />
              <LocaleSwitch />
            </div>
          </div>
          <div aria-hidden className="mt-3 flex items-center gap-0">
            <span className="h-0.5 w-10 bg-accent-600" />
            <span className="h-px flex-1 bg-parchment-200" />
          </div>
          <p className="mt-4 max-w-xl text-ink-600">{t("home.intro")}</p>
          {stats ? (
            /* The numbers say how large the corpus is but not what's in it.
               The link right after them is the answer to the question the
               line raises, and the only way into the corpus that doesn't
               go through a paid search.

               Three numbers, not five. The passage count (just over a
               million) and the year range used to stand here and measured
               the machine rather than the corpus: a passage is retrieval's
               unit, not the reader's, and "1800 BC–1980" is a span nobody
               asks a question within. Works, authors, and genres are the
               three numbers the link after them actually leads to. */
            <p className="mt-3 text-xs text-ink-400">
              {t("home.stats", {
                works: num(stats.works),
                authors: num(stats.authors),
                genres: num(stats.genres),
              })}{" "}
              ·{" "}
              <Link
                href={corpusHref(locale)}
                className="underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
              >
                {t("nav.corpus")}
              </Link>
            </p>
          ) : (
            <p className="mt-3 rounded border border-accent-600/40 border-l-[3px] border-l-accent-600 bg-accent-600/8 px-3 py-2 text-xs text-accent-700">
              {t("home.notIndexedBefore")}{" "}
              <code className="font-mono">pnpm ingest</code>{" "}
              {t("home.notIndexedAfter")}
            </p>
          )}
        </header>
      )}

      <CanonSearch
        ref={searchRef}
        available={available}
        onActiveChange={setActive}
      />
    </>
  );
}
