"use client";

import { createContext, use } from "react";
import type { ModelId } from "@/lib/provider";

export interface CostEstimate {
  /**
   * What a translation has cost on average, so far — read once on the
   * server and passed down, the same pattern `LocaleProvider` uses for the
   * cookie.
   *
   * The figure only ever appears next to "Översätt till svenska", *before*
   * the click that spends money — `CostTag` already shows the real,
   * per-call price after the fact, but by then the decision is made. This
   * is an estimate and not a quote: it's the archive's own average
   * (`translationCost / translations` in `src/lib/stats.ts`), not a fresh
   * token count, so it's shown with a leading "≈" and never claims to be
   * the figure this particular passage will cost. `null` before any
   * translation has ever been paid for — there's no average of zero rows
   * to show.
   */
  avgTranslationUsd: number | null;
  /**
   * The same estimate, for a whole search rather than one translation —
   * shown under `SearchBox` before the "Sök" click, which is the moment the
   * cost decision is actually made and, until now, the one place in the
   * app with a price twelve times the translation's own and nothing shown
   * for it. `usage.spent / usage.claudeSearches` in `layout.tsx`; `null`
   * only when no Claude search has ever been saved — it says nothing about
   * the *current* `provider`, since a local search's own estimate is drawn
   * from `MODEL_SEARCH_SECONDS` instead and never reads this field (see
   * `CanonSearch`'s `searchEstimate`).
   */
  avgSearchUsd: number | null;
  /**
   * Which model a search would run on right now — the same cookie value
   * `layout.tsx` already reads for `NavMenu`. Carried here too so the
   * estimate line under the search box can name it without a second
   * context just for one field.
   */
  provider: ModelId;
  /** The same dollar → krona rate `CostTag` converts with, so the estimate and the real price agree. */
  rate: number;
}

const CostEstimateContext = createContext<CostEstimate>({
  avgTranslationUsd: null,
  avgSearchUsd: null,
  provider: "claude",
  rate: 0,
});

export function CostEstimateProvider({
  avgTranslationUsd,
  avgSearchUsd,
  provider,
  rate,
  children,
}: CostEstimate & { children: React.ReactNode }) {
  return (
    <CostEstimateContext value={{ avgTranslationUsd, avgSearchUsd, provider, rate }}>
      {children}
    </CostEstimateContext>
  );
}

/**
 * Renamed from `useAvgTranslationCost`: the context carries the search
 * estimate and the active model now too, and the old name described only
 * the field `PassageAccordion` happens to read.
 */
export function useCostEstimate(): CostEstimate {
  return use(CostEstimateContext);
}
