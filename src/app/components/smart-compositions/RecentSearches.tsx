"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { SearchSummary } from "@/lib/searches";
import { describeFilter, isFiltered } from "@/lib/taxonomy";
import { forgetSearch } from "../../actions";
import { useRecentSearchesLive } from "../providers/RecentSearchesProvider";
import { useT } from "../providers/LocaleProvider";

/**
 * Matches the `recentSearches(6)` every caller (`page.tsx`, `s/[id]/page.tsx`)
 * passes as `searches` — not read off `searches.length`, since that's
 * whatever the server happened to find (0 on a fresh install), not how many
 * rows this list is supposed to show.
 */
const MAX_VISIBLE = 6;

/**
 * The archive of past queries, with a trash icon per row.
 *
 * Sits in the page's right margin, not below it. The list is an entry point
 * into the corpus — the second way in, besides the search box — and an
 * entry point below the footer is never read by anyone who isn't already
 * looking for it. The measurements are the column's: rows wrap onto
 * multiple lines and the line height is set accordingly.
 *
 * The button only shows on row hover — the list should read as a list of
 * queries, not as an admin interface — but it's always in the DOM and
 * becomes visible as soon as it gets keyboard focus. A control reachable
 * only by mouse is no control at all for someone tabbing through.
 *
 * The row is removed from the list immediately on click rather than waiting
 * for the server: `forgetSearch` re-renders the page in the same response,
 * but that takes a round trip, and in the meantime the removed query
 * shouldn't sit there looking like it's still there. If the call fails, the
 * slug is added back and the row reappears.
 */
export function RecentSearches({
  searches,
  currentSlug,
}: {
  searches: SearchSummary[];
  /**
   * The permalink already on screen, when there is one — only `/s/[id]`
   * passes this. Marks that row instead of leaving it to read as just
   * another link in the list when it's actually where the reader already
   * is; the home page never has a current slug, since a live search hasn't
   * been assigned one until it's done.
   */
  currentSlug?: string;
}) {
  const { t, tn, locale } = useT();
  const { live } = useRecentSearchesLive();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // A search finished on this page since it loaded goes in front of the
  // list the server rendered — `live` is `[]` outside a
  // `RecentSearchesProvider` (see that component), so this is a no-op for
  // every existing story, which never wraps one.
  //
  // Capped at `MAX_VISIBLE`, not left to grow: nothing stops someone from
  // finishing three live searches in one visit, and the list must still
  // read as "the six most recent" — the promise `searches.intro` makes
  // about this exact list — not as a running tally that grows past it.
  // Not capped at `searches.length`: on a fresh install `searches` is `[]`
  // (nothing saved yet), and the very first live search would otherwise be
  // sliced away by its own arrival.
  const merged =
    live.length === 0
      ? searches
      : [
          ...live,
          ...searches.filter((s) => !live.some((l) => l.slug === s.slug)),
        ].slice(0, MAX_VISIBLE);

  const visible = merged.filter((s) => !removed.has(s.slug));
  if (visible.length === 0) return null;

  const remove = (slug: string) => {
    setRemoved((prev) => new Set(prev).add(slug));
    startTransition(async () => {
      try {
        await forgetSearch(slug);
      } catch {
        setRemoved((prev) => {
          const next = new Set(prev);
          next.delete(slug);
          return next;
        });
      }
    });
  };

  return (
    /* The column divider is a hairline (`parchment-200`), not a control
       border (`300`). It separates two columns and shouldn't look like the
       edge of something clickable — WCAG 1.4.11's three-to-one applies to
       controls, and this is typography. */
    <section className="border-t border-parchment-200 pt-6 lg:border-t-0 lg:border-l lg:border-parchment-200 lg:pt-0 lg:pl-6">
      <h2 className="eyebrow eyebrow-rule">
        {t("recent.heading")}
      </h2>
      {/* A hairline between rows, not just the space between them — the
          same register device the results list and the example questions
          use, so the three lists in the page read as one family. */}
      <ul className="mt-3 divide-y divide-parchment-200">
        {visible.map((r) => {
          const current = r.slug === currentSlug;
          return (
          <li
            key={r.slug}
            className={`group relative py-3 pr-7 first:pt-0 last:pb-0 ${current ? "border-l-2 border-accent-600 pl-3 -ml-3.5" : ""}`}
          >
            <Link
              href={`/s/${r.slug}`}
              aria-current={current ? "page" : undefined}
              className={`block font-serif text-sm leading-snug transition hover:text-accent-700 ${current ? "font-semibold text-ink-900" : "text-ink-800"}`}
            >
              {r.prompt}
            </Link>
            {/* The selection after the passage count: two rows can carry the
                same words and still be two different searches, and
                otherwise the difference only shows once clicked. */}
            <span className="mt-0.5 block text-xs text-ink-400">
              {tn("recent.count", r.passageCount)}
              {isFiltered(r.filter) &&
                ` · ${describeFilter(r.filter, locale)}`}
              {" · "}
              {/* `whitespace-nowrap`: a model identifier like
                  "qwen-3.8-27b-8bit" wraps at its own hyphens in this narrow
                  column otherwise, splitting a single name across two lines
                  the way running text never does. The rest of the line can
                  still wrap before it. */}
              <span className="whitespace-nowrap font-mono">{r.model}</span>
            </span>
            <button
              type="button"
              onClick={() => remove(r.slug)}
              aria-label={t("recent.remove", { prompt: r.prompt })}
              title={t("recent.removeTitle")}
              /* top-3 matches the row's own py-3, except on the first row,
                 which has no top padding to match (`first:pt-0` above) and
                 so needs the button flush at top-0 instead. */
              className="cursor-pointer absolute right-0 top-3 group-first:top-0 rounded p-1 text-ink-400 opacity-0 transition hover:bg-accent-600/10 hover:text-accent-700 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <TrashIcon />
            </button>
          </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Trash can, drawn rather than fetched: an icon library just for one glyph. */
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7h16" />
      <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1Z" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
