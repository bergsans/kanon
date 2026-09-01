"use client";

import { createContext, use, useCallback, useState } from "react";
import type { SearchSummary } from "@/lib/searches";

interface RecentSearchesContextValue {
  /**
   * Searches finished on this page since it loaded, newest first — `[]`
   * outside a provider (the default value below), which is also the "no
   * live search yet" state inside one. `RecentSearches` merges this in
   * front of the list the server rendered. `SearchSummary`, not a
   * session-local variant of it: every field it carries (including `cost`)
   * is already known the moment a search finishes, from the same "done"
   * event `CanonSearch` reads its own cost tag from.
   */
  live: SearchSummary[];
  addRecent: (entry: SearchSummary) => void;
}

const RecentSearchesContext = createContext<RecentSearchesContextValue>({
  live: [],
  addRecent: () => {},
});

/**
 * Lets a search finished with `CanonSearch` appear in "Senast ställda
 * frågor" without a page reload.
 *
 * The server-rendered list (`recentSearches(6)` in `searches.ts`) is read
 * once, when the page is requested — a search that finishes afterward,
 * entirely client-side, never reaches it until the next real navigation.
 * `page.tsx` and `s/[id]/page.tsx` wrap their whole grid in this provider so
 * `CanonSearch` (in `<main>`) and `RecentSearches` (in `<aside>`) — siblings,
 * neither an ancestor of the other — share one place to hand a finished
 * search across.
 *
 * Deliberately holds only the *live* additions, not a merged copy of the
 * server's list: `RecentSearches` still takes its own `searches` prop
 * unchanged, so every existing story keeps rendering exactly the data it
 * was given, with `live` empty (the default above) outside a provider.
 */
export function RecentSearchesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [live, setLive] = useState<SearchSummary[]>([]);

  const addRecent = useCallback((entry: SearchSummary) => {
    // De-duped by slug, not just prepended: the same question asked twice
    // in one visit (or a slow "done" arriving after a fast retry) should
    // move to the top, not appear as two rows for one search.
    setLive((prev) => [entry, ...prev.filter((e) => e.slug !== entry.slug)]);
  }, []);

  return (
    <RecentSearchesContext value={{ live, addRecent }}>
      {children}
    </RecentSearchesContext>
  );
}

export function useRecentSearchesLive(): RecentSearchesContextValue {
  return use(RecentSearchesContext);
}
