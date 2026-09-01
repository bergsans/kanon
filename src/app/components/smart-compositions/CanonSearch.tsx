"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { searchAsMarkdown } from "@/lib/citation";
import { money } from "@/lib/money";
import {
  isLocalModel,
  modelDuration,
  modelLabel,
  MODEL_SEARCH_SECONDS,
} from "@/lib/provider";
import {
  ProtocolError,
  readEvents,
  SEARCH_TOKEN_HEADER,
  type CostPayload,
  type ExternalHit,
  type PassagePayload,
} from "@/lib/protocol";
import {
  describeFilter,
  isFiltered,
  NO_FILTER,
  type CorpusFacets,
  type CorpusFilter,
} from "@/lib/taxonomy";
import { SearchBox } from "../ui/SearchBox";
import { PassageAccordion } from "./PassageAccordion";
import { CostTag } from "./CostTag";
import { ExportMenu } from "./ExportMenu";
import { ExternalSources } from "./ExternalSources";
import { useCostEstimate } from "../providers/CostEstimateProvider";
import { useT } from "../providers/LocaleProvider";
import { useRecentSearchesLive } from "../providers/RecentSearchesProvider";
import { SegmentedControl } from "../ui/SegmentedControl";

/**
 * A saved search, when the page is opened at its permalink. Then the answer
 * already exists and nothing needs to be fetched — but the same UI should
 * render it, and a new query in the box should work as usual.
 */
export interface InitialSearch {
  prompt: string;
  /** The genres and eras the query was asked of. Empty = the whole corpus. */
  filter: CorpusFilter;
  slug: string;
  passages: PassagePayload[];
  /** What the search cost when it ran. Opening the link costs nothing. */
  cost: CostPayload;
  /**
   * How long the search took when it ran, in milliseconds. Opening the link
   * is instant, but that instantness isn't the number worth showing — the
   * search's own duration is. 0 for a row saved before this was measured,
   * and `CanonSearch` treats that the same as "no duration known".
   */
  durationMs: number;
  /**
   * How many works have joined the collection since this search ran — 0
   * when nothing has changed, or when the row predates the column that
   * tracks it (see `corpusGrowthSince` in searches.ts). Computed server-side
   * in `s/[id]/page.tsx`, since a permalink never touches `/api/search` at
   * all and so never sees the `done` event's own `corpusGrowth` field.
   */
  corpusGrowth: number;
}

/**
 * A finished search, kept around after `pushState`/`replaceState` moves the
 * address bar to its permalink — `history.pushState`/`replaceState` only
 * change the URL, they don't touch this component's own state, and this app
 * never unmounts `CanonSearch` on `/` to pick that up automatically the way
 * a real route change would. The `popstate` handler below reads this back
 * out when forward lands on the URL it was saved under.
 */
type CompletedSearch = {
  question: string;
  filter: CorpusFilter;
  passages: PassagePayload[];
  slug: string;
  cost: CostPayload;
  durationMs: number;
  corpusGrowth: number;
  cachedPrompt: string | null;
};

/**
 * The order between passages.
 *
 * "relevans" (relevance) is the list as it came: Claude's selection in his
 * order. "kronologiskt" (chronological) instead lines the answers up in time
 * order, which for a query like "civilization versus barbarism" shows
 * something else — that Tacitus, Gibbon, and Conrad say partly the same
 * thing seventeen hundred years apart.
 */
type Order = "relevans" | "kronologiskt";

/** The labels on the buttons. The value is internal and never translated. */
const ORDER_KEY = {
  relevans: "sort.relevance",
  kronologiskt: "sort.chronological",
} as const;

type Phase =
  | "idle"
  | "expanding"
  | "retrieving"
  | "reading"
  | "done"
  | "error"
  // A guardrail chose not to answer — the relevance check or Claude's own
  // refusal. Kept apart from "error": `busy` already treats every phase
  // outside its own list as not-busy, so this needs no change there, but
  // the render below picks a neutral box instead of the accent warning one.
  | "declined";

/**
 * Clusters passages from the same work together, in the order their first
 * passage appeared in `list` — so the "———" ditto mark in
 * `PassageAccordion` (`sameWorkAsAbove`) can actually apply. That mark only
 * ever fires between strictly adjacent rows, on purpose: it stands for "the
 * same as directly above", not "seen earlier in the list", and a mark that
 * meant the second thing could point at a row scrolled off screen. But the
 * spread filter allows up to seven passages per work in sixty-four, and
 * relevance order alone routinely lands them a row or two apart rather than
 * next to each other — so without this pass, a work's second passage almost
 * never actually sat beneath its first, and the mark rarely fired at all.
 *
 * The list stays relevance-ordered at the *work* level: a work's whole
 * block sits exactly where its best-ranked passage would have sat on its
 * own, and only the passages within that one work are pulled together
 * around it. Applied after `order` picks relevance or chronological, not
 * instead of it — within a tied year, chronological order already breaks
 * ties by relevance, so this only changes which of several same-year works'
 * passages end up interleaved.
 */
function groupByWork(list: PassagePayload[]): PassagePayload[] {
  const byWork = new Map<string, PassagePayload[]>();
  const workOrder: string[] = [];
  for (const p of list) {
    let bucket = byWork.get(p.workId);
    if (!bucket) {
      bucket = [];
      byWork.set(p.workId, bucket);
      workOrder.push(p.workId);
    }
    bucket.push(p);
  }
  return workOrder.flatMap((id) => byWork.get(id)!);
}

/**
 * The one thing a parent can ask of a running search session: drop it and
 * go back to a blank one. `HomeSearchShell` is the only caller — the "←
 * alla frågor" breadcrumb above an answer is a `next/link` to `/`, and on
 * every other page that's a real route change that mounts a fresh,
 * necessarily idle `CanonSearch`. On the home page it links to the very
 * route already on screen, so nothing unmounts and nothing else would ever
 * clear the answer still showing beneath it.
 */
export interface CanonSearchHandle {
  reset: () => void;
}

export const CanonSearch = forwardRef<
  CanonSearchHandle,
  {
    initial?: InitialSearch;
    /** The genres and eras that have indexed works. Empty lists hide the selector. */
    available: CorpusFacets;
    /**
     * Told whenever the session moves out of (or back into) the idle phase —
     * i.e. whether an answer, an error, or a search in flight is on screen.
     * `HomeSearchShell` uses it to collapse the front page's full masthead
     * down to the same compact header every other page uses once there's
     * something to read below it. Never fired for a saved search opened cold
     * (`initial` set): that page starts "done" already and shows the compact
     * header from its own first render, with nothing to collapse.
     */
    onActiveChange?: (active: boolean) => void;
  }
>(function CanonSearch({ initial, available, onActiveChange }, ref) {
  const { t, tn, num, locale } = useT();
  const m = money(locale);
  // Which model is currently answering, for the progress bar's own baseline
  // (`MODEL_SEARCH_SECONDS[provider]`), the pre-search estimate handed to
  // `SearchBox` below, and the price on "Sök på nytt" below. Read here, not
  // in `SearchBox` itself: that's a `ui/` component and may not read a
  // provider — see the estimate prop's own comment on `SearchBox`.
  const { provider, avgSearchUsd, rate } = useCostEstimate();
  /*
   * "Claude · ~2 min 4 s · ≈ $0,12 · 1,15 kr" or "Lokal (qwen3:14b) · ~9 min
   * 37 s · kostar ingenting" — computed once here and handed down as a
   * finished string, the one piece of app data `SearchBox` needs but must
   * not fetch itself. Claude's price is the archive's own average (see
   * `avgClaudeSearchCost` in stats.ts); a brand-new install has no history
   * to average, hence the third variant. A local model always costs
   * nothing, worth stating plainly rather than as "$0" next to a timing
   * that's usually minutes, not seconds.
   */
  const searchEstimate = isLocalModel(provider)
    ? t("search.estimateLocal", {
        model: modelLabel(provider, locale),
        duration: modelDuration(provider, locale),
      })
    : avgSearchUsd != null
      ? t("search.estimateClaude", {
          model: modelLabel(provider, locale),
          duration: modelDuration(provider, locale),
          amount: `${m.usd(avgSearchUsd)} · ${m.sek(avgSearchUsd * rate)}`,
        })
      : t("search.estimateClaudeNoHistory", {
          model: modelLabel(provider, locale),
          duration: modelDuration(provider, locale),
        });
  const { addRecent } = useRecentSearchesLive();
  const [phase, setPhase] = useState<Phase>(initial ? "done" : "idle");
  const [question, setQuestion] = useState(initial?.prompt ?? "");
  /*
   * The selection lives here and not in the search box, for two reasons. It
   * must survive a search — someone who filtered on philosophy wants their
   * next query asked of philosophy too — and a permalink must open with the
   * genres the query was actually asked of, otherwise the page says
   * something untrue about the answer it's showing.
   */
  const [filter, setFilter] = useState<CorpusFilter>(
    initial?.filter ?? NO_FILTER,
  );
  /* The genres the answer on screen came from, as they were when the search
     was sent. Distinct from the selection above: changing the chips without
     re-searching should leave the line under the query still describing the
     answer shown beneath it. */
  const [searched, setSearched] = useState<CorpusFilter>(
    initial?.filter ?? NO_FILTER,
  );
  const [passages, setPassages] = useState<PassagePayload[]>(
    initial?.passages ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  /** The guardrail's own explanation — see the "declined" phase's comment. */
  const [declined, setDeclined] = useState<string | null>(null);
  /* What the selection step is reading, from the stream's `candidates` event —
     the only concrete thing to show during the longest wait of a search. */
  const [reading, setReading] = useState<{ count: number; works: number } | null>(
    null,
  );
  const [order, setOrder] = useState<Order>("relevans");
  /*
   * The "utanför samlingen" checkbox — see `findExternal` in claude.ts.
   * Off by default, like the local model and every other opt-in cost in
   * this app. Persists across searches the same way `filter` does: someone
   * who checked it wants their next question searched the same way too.
   */
  const [external, setExternal] = useState(false);
  /*
   * The external step's own three-part state, kept apart from `passages`
   * and `cost` above for the same reason the wire event is its own type
   * (see protocol.ts): a pointer to a page outside the collection isn't a
   * passage, and its cost is never a cache hit even when the rest of the
   * answer is. `externalHits` is `null` until the step has ever run for the
   * search on screen — `ExternalSources` reads that, not `externalLoading`
   * alone, to decide whether to render anything at all.
   */
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalHits, setExternalHits] = useState<ExternalHit[] | null>(
    null,
  );
  const [externalCost, setExternalCost] = useState<{
    usd: number;
    rate: number;
  } | null>(null);
  /*
   * Reopens the search box on top of an answer already on screen, prefilled
   * with the question that produced it — the most common thing to want next
   * is to adjust the question just asked, not start over from a blank box.
   * Distinct from `phase`: the answer below stays exactly as it is while
   * this is true, and it's reset to false the moment a search actually
   * runs, in `search()` below.
   */
  const [editing, setEditing] = useState(false);
  /*
   * The top passage starts expanded — a page of collapsed titles gives
   * nothing to read until a second click, and the first one is already the
   * strongest answer, by reranking's own order. Applies the same way to a
   * permalink opened cold and to a freshly finished search: see the
   * `initial` value here and the "passages" case in `search` below.
   */
  const [open, setOpen] = useState<Set<number>>(() =>
    initial?.passages.length ? new Set([initial.passages[0].chunkId]) : new Set(),
  );
  const [slug, setSlug] = useState<string | null>(initial?.slug ?? null);
  const [cost, setCost] = useState<CostPayload | null>(initial?.cost ?? null);
  /*
   * Wall-clock time the last live search took, measured on the client from
   * fetch to the "done" event — network included, since that's what the
   * person watching the spinner actually waited through. For a permalink
   * opened cold, nothing was fetched, so this falls back to the duration
   * archived alongside the search itself — `|| null` on purpose: 0 means a
   * row saved before that column existed, and is "unknown", not "instant".
   */
  const [durationMs, setDurationMs] = useState<number | null>(
    initial?.durationMs || null,
  );
  /*
   * Set only on a cache hit — how many works have joined the collection
   * since this exact answer was computed (see `corpusGrowth` on the "done"
   * event, and `InitialSearch.corpusGrowth` for the permalink path). 0
   * means nothing to say, not "not yet known" — the notice is gated on
   * `corpusGrowth > 0` directly rather than on a separate boolean.
   */
  const [corpusGrowth, setCorpusGrowth] = useState<number>(
    initial?.corpusGrowth ?? 0,
  );
  /*
   * Set only when a *semantic* cache hit answered a differently-worded
   * question than the one actually typed (see `cachedPrompt` on the "done"
   * event). No `initial` counterpart: opening a permalink reads the exact
   * saved row by slug, never through the similarity search that's the only
   * way this can happen.
   */
  const [cachedPrompt, setCachedPrompt] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  /*
   * The token `/api/search` hands back for the search currently in flight,
   * read off the response header before the stream is consumed (see
   * `search()` below). `abort.current?.abort()` alone only stops *this*
   * client from reading the stream — the pipeline now runs to completion
   * and saves regardless (see `search-registry.ts`) — so cancelling the
   * work itself needs this token, sent to `POST /api/search/cancel`.
   * `null` once no search is in flight, so a stray Avbryt click (or a
   * `cached: true` answer, which never registers a cancellable run worth
   * mentioning) has nothing to send.
   */
  const searchTokenRef = useRef<string | null>(null);

  // Stops *this* component from reading the stream once it's gone —
  // navigating away mid-search (NavMenu, a link, closing the tab) used to
  // leave the fetch open with nothing left to receive its `setState` calls,
  // and `addRecent` at the "done" event still fired into a provider whose
  // consumer had already unmounted. Deliberately NOT `cancelSearch` (the
  // `POST /api/search/cancel` the Avbryt button sends): the server keeps
  // running and saves on its own by design (see `searchTokenRef`'s own
  // comment and `search-registry.ts`) — only the reading stops, not the run.
  useEffect(() => () => abort.current?.abort(), []);

  /*
   * The live stopwatch next to the busy indicator. `startedAtRef` is read
   * from the tick interval below, not from state — a state value captured
   * in the closure that opens the interval would freeze at the number it
   * had when the interval was created.
   */
  const startedAtRef = useRef<number | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  /*
   * Whether a search on this mount has already turned the address bar into
   * a permalink. False only on a fresh start page (no `initial`): the first
   * search there must `pushState`, or the empty start page is never in
   * history at all and the back button skips over it. Every search after
   * that — and the first one on a page opened at a permalink, which already
   * has something to go back to — uses `replaceState`, so the back button
   * always lands on that one empty start page instead of stepping through
   * every intermediate answer.
   */
  const hasPushedHistoryRef = useRef(!!initial);
  /*
   * The most recently finished search, so the `popstate` handler below can
   * put it straight back on screen if the user goes forward again after
   * going back. Seeded from `initial` on a permalink page, since that's a
   * finished search too.
   */
  const lastCompletedRef = useRef<CompletedSearch | null>(
    initial
      ? {
          question: initial.prompt,
          filter: initial.filter,
          passages: initial.passages,
          slug: initial.slug,
          cost: initial.cost,
          durationMs: initial.durationMs,
          corpusGrowth: initial.corpusGrowth,
          // See `cachedPrompt`'s own comment: never applies to a permalink.
          cachedPrompt: null,
        }
      : null,
  );

  const sorted = useMemo(() => {
    const list = [...passages];
    const ordered =
      order === "kronologiskt"
        ? list.sort((a, b) => a.year - b.year || a.index - b.index)
        : list.sort((a, b) => a.index - b.index);
    return groupByWork(ordered);
  }, [passages, order]);

  // Printing opens every passage for the duration of the print and restores
  // whatever was open before — the same behavior `ProjectView` gives a saved
  // project, and for the same reason: on paper nothing is a click away, so a
  // collapsed row is sixteen words nobody can get past.
  const beforeOpen = useRef<Set<number> | null>(null);
  useEffect(() => {
    const expand = () => {
      setOpen((prev) => {
        beforeOpen.current = prev;
        return new Set(sorted.map((p) => p.chunkId));
      });
    };
    const restore = () => {
      if (beforeOpen.current) setOpen(beforeOpen.current);
      beforeOpen.current = null;
    };
    window.addEventListener("beforeprint", expand);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", expand);
      window.removeEventListener("afterprint", restore);
    };
  }, [sorted]);

  // Moved to taxonomy.ts as `describeFilter`, once the searches archive
  // page needed the exact same "philosophy, history · antiquity" line —
  // see that function's own comment for the reasoning behind the dot.
  const describe = (f: CorpusFilter) => describeFilter(f, locale);

  const toggle = useCallback((chunkId: number) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(chunkId)) next.add(chunkId);
      return next;
    });
  }, []);

  const busy =
    phase === "expanding" || phase === "retrieving" || phase === "reading";

  // Ticks the counter next to the busy indicator while a search is in
  // flight. Once a second, not the 47ms this used to run at: a search takes
  // up to a couple of minutes, and `m.duration` below only ever shows one
  // decimal — millisecond-accurate state twenty-one times a second bought
  // nothing but re-rendering the whole result of `CanonSearch` (the filter
  // chips included) for digits nobody could read.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => {
      setLiveMs(performance.now() - (startedAtRef.current ?? performance.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [busy]);

  // The tab should say a search is running, the same way the page itself
  // already does — someone who's switched away to read something else
  // while waiting has no other way to notice it finished. Restored to
  // whatever the tab said before, not hardcoded back to the app name: on a
  // saved search's own page that title carries the question.
  useEffect(() => {
    if (!busy) return;
    const previous = document.title;
    document.title = `${t("search.submitBusy")} — ${t("app.name")}`;
    return () => {
      document.title = previous;
    };
  }, [busy, t]);

  const search = useCallback(
    async (
      prompt: string,
      within: CorpusFilter,
      /**
       * Whether to also run the external step — read as a parameter, not
       * off the `external` state directly, for the same reason `within` is
       * a parameter and not read off `filter`: this callback is memoized
       * and closing over the state instead would freeze it at whatever
       * value it held the first time `search` was created.
       */
      wantExternal: boolean,
      fresh = false,
    ) => {
      // Stops *this* client from reading the previous search's stream —
      // otherwise two streams would write into the same state. It no
      // longer stops the previous search itself: that pipeline runs to
      // completion and saves on its own now (see `search-registry.ts`), and
      // shows up in "Senast ställda frågor" once it's done. Only Avbryt
      // (`cancelCurrentSearch` below) reaches into a run and stops it.
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      // Cleared, not carried over: until the new response's header arrives
      // below, there is no run this session could cancel.
      searchTokenRef.current = null;

      setQuestion(prompt);
      setSearched(within);
      setPassages([]);
      setOpen(new Set());
      setError(null);
      setDeclined(null);
      setReading(null);
      setSlug(null);
      setEditing(false);
      // The cost is unknown until the last call has been made. Letting the
      // previous query's number stand while the new one searches would be
      // the one sure way to show the wrong figure.
      setCost(null);
      setDurationMs(null);
      setCorpusGrowth(0);
      setCachedPrompt(null);
      setExternalLoading(wantExternal);
      setExternalHits(null);
      setExternalCost(null);
      setPhase("expanding");
      const startedAt = performance.now();
      startedAtRef.current = startedAt;
      setLiveMs(0);

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            genres: within.genres,
            eras: within.eras,
            fresh,
            external: wantExternal,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => null);
          throw new Error(
            detail?.error ?? t("result.serverSaid", { status: res.status }),
          );
        }

        // Present on every real run, absent only in a test harness that
        // mocks the response without it — `cancelCurrentSearch` already
        // guards against a null token, so nothing else needs to.
        searchTokenRef.current = res.headers.get(SEARCH_TOKEN_HEADER);

        // Tracked outside state: the "done" case below needs the passages
        // this same search just streamed in, and `passages` in closure scope
        // would be whatever it was when this callback was created, not what
        // the two `setPassages` calls above it queued.
        let streamedPassages: PassagePayload[] = [];
        // Set by the three terminal event types below. If the stream ends
        // without ever setting it — the connection dropped, a proxy's idle
        // timeout fired during the ~2-minute rerank wait, the server
        // process died — the `for await` below simply returns, same as a
        // normal end of stream, and `busy` would otherwise stay true
        // forever: the progress timer, the tab-title change and the Avbryt
        // button all keep going with nothing left to finish them.
        let reachedEnd = false;

        for await (const event of readEvents(res.body)) {
          switch (event.type) {
            case "plan":
              setPhase("retrieving");
              break;
            case "candidates":
              setReading({ count: event.count, works: event.works });
              setPhase("reading");
              break;
            case "passages":
              streamedPassages = event.passages;
              setPassages(event.passages);
              setOpen(
                event.passages.length
                  ? new Set([event.passages[0].chunkId])
                  : new Set(),
              );
              break;
            case "external":
              // Arrives whenever the step finishes — often after "done",
              // since it runs alongside retrieval and reranking rather than
              // before them (see `startExternal` in the route). Never
              // reopens `lastCompletedRef`/history: a page revisited via
              // back/forward simply shows the answer without this section,
              // which matches what the permalink itself would show, since
              // the step is deliberately never saved (see `searches.ts`).
              setExternalHits(event.hits);
              setExternalCost({ usd: event.usd, rate: event.rate });
              setExternalLoading(false);
              break;
            case "done":
              reachedEnd = true;
              // Nothing left to cancel — the server side has already
              // unregistered this token by the time this event is sent.
              searchTokenRef.current = null;
              setSlug(event.slug);
              // `event.cached` doesn't need its own state: the payload
              // carries it, and the cost line is the only place that says
              // anything about it.
              setCost(event.cost);
              setDurationMs(performance.now() - startedAt);
              setCorpusGrowth(event.corpusGrowth ?? 0);
              setCachedPrompt(event.cachedPrompt ?? null);
              setPhase("done");
              // The address bar should point at the answer being viewed, so
              // a reload or a shared link gives the same page. The very
              // first search on a fresh start page pushes, so that empty
              // page stays behind it in history for the back button to
              // land on; every later search in the same session replaces,
              // so back still goes straight there instead of through each
              // answer in between.
              if (event.slug) {
                lastCompletedRef.current = {
                  question: prompt,
                  filter: within,
                  passages: streamedPassages,
                  slug: event.slug,
                  cost: event.cost,
                  durationMs: performance.now() - startedAt,
                  corpusGrowth: event.corpusGrowth ?? 0,
                  cachedPrompt: event.cachedPrompt ?? null,
                };
                // So the answer shows up in "Senast ställda frågor" without
                // a reload — see `RecentSearchesProvider`. `createdAt` is
                // approximate (the server never sends one back here), which
                // is fine: nothing persists this value, it only orders a
                // client-side list until the next real page load replaces
                // it with the database's own.
                addRecent({
                  slug: event.slug,
                  prompt,
                  filter: within,
                  createdAt: new Date().toISOString(),
                  model: event.cost.model,
                  passageCount: streamedPassages.length,
                  cost: event.cost.usd,
                });
                if (hasPushedHistoryRef.current) {
                  window.history.replaceState(null, "", `/s/${event.slug}`);
                } else {
                  window.history.pushState(null, "", `/s/${event.slug}`);
                  hasPushedHistoryRef.current = true;
                }
              }
              break;
            case "error":
              reachedEnd = true;
              // `externalLoading` is left alone here on purpose: the route's
              // `finishExternal` always runs from its own `finally` block
              // and still sends exactly one "external" event after this,
              // whenever the checkbox asked for one — see that function's
              // own comment on why the invariant holds even on this path.
              // Clearing the flag here would make the section vanish and
              // then pop back a moment later once that event lands.
              searchTokenRef.current = null;
              setError(event.message);
              setPhase("error");
              break;
            case "declined":
              reachedEnd = true;
              // Same two fields `done` sets for a resultless query — the
              // expansion (or, for a refusal, expansion plus retrieval) was
              // billed either way, and showing nothing here would make a
              // declined question look free. `externalLoading` is left
              // alone for the same reason as in "error" above: whether this
              // decline is the out-of-scope guardrail (which never started
              // the step) or Claude's own refusal mid-rerank (which may
              // already have), the route's `finishExternal` sends exactly
              // one "external" event either way.
              searchTokenRef.current = null;
              setCost(event.cost);
              setDurationMs(performance.now() - startedAt);
              setDeclined(event.message);
              setPhase("declined");
              break;
          }
        }
        if (!reachedEnd) {
          searchTokenRef.current = null;
          setExternalLoading(false);
          setError(t("result.streamEnded"));
          setPhase("error");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setExternalLoading(false);
        // Shown as-is only when it's text the app itself wrote — the
        // `!res.ok` branch above throws `Error` with either the server's
        // own (already localized) `error` field or a localized fallback.
        // `TypeError` is the browser's own wording for a failed `fetch`
        // ("Failed to fetch", "Load failed", …) and `ProtocolError` is a
        // line that didn't parse as JSON (see protocol.ts) — neither is
        // text meant for a reader, in either language, so both fall back
        // to a translated message instead of a raw diagnostic string.
        const message =
          err instanceof ProtocolError || err instanceof TypeError
            ? t("result.unknownError")
            : err instanceof Error
              ? err.message
              : t("result.unknownError");
        setError(message);
        setPhase("error");
      }
      // `t` only changes when the language changes, and then the next
      // search should send its fallback error message in the new language.
      // `addRecent` is stable (see `RecentSearchesProvider`), listed anyway
      // since it's read inside this callback.
    },
    [t, addRecent],
  );

  /*
   * The Avbryt button. Distinct from `resetToIdle` below: this only ever
   * runs while a search is actually in flight, and it must leave the
   * question in the box exactly as typed — someone who changed their mind
   * mid-search wants to adjust the question, not retype it. `question`,
   * `filter` and the rest are untouched, and the search box itself stays
   * mounted and keeps its own uncontrolled text (see `SearchBox`'s
   * `initialValue` comment) because `phase !== "done"` already keeps
   * `showSearchBox` true throughout a busy search.
   *
   * The cancel request is fire-and-forget: the client's own state moves to
   * "idle" immediately regardless of whether it lands, the same way the
   * rest of the app never waits on a network call before reflecting a
   * choice already made. `keepalive` gives it a chance to still reach the
   * server even if this click is quickly followed by a navigation.
   */
  const cancelCurrentSearch = useCallback(() => {
    const token = searchTokenRef.current;
    abort.current?.abort();
    setPhase("idle");
    setReading(null);
    setError(null);
    setDeclined(null);
    // The route never sends "external" for a run it never finished — see
    // `finishExternal`'s own guard on `signal.aborted` — so nothing else
    // clears this spinner once Avbryt is clicked.
    setExternalLoading(false);
    searchTokenRef.current = null;
    if (!token) return;
    fetch("/api/search/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true,
    }).catch(() => {
      // Nothing to recover: the search either stops because this arrived,
      // or it finishes and saves on its own — both are fine outcomes.
    });
  }, []);

  /*
   * Drops whatever search is on screen and returns to a blank session —
   * shared by the `popstate` handler below (back to `/`) and the imperative
   * handle `HomeSearchShell` calls when the "← alla frågor" link is clicked
   * while already on `/`, where that link can't rely on an actual
   * navigation to do this for it.
   */
  const resetToIdle = useCallback(() => {
    abort.current?.abort();
    setPhase("idle");
    setQuestion("");
    setFilter(NO_FILTER);
    setSearched(NO_FILTER);
    setPassages([]);
    setOpen(new Set());
    setError(null);
    setDeclined(null);
    setReading(null);
    setEditing(false);
    setSlug(null);
    setCost(null);
    setDurationMs(null);
    setCorpusGrowth(0);
    setCachedPrompt(null);
    // Back to unchecked, like `filter` goes back to `NO_FILTER` — a blank
    // session starts from the same defaults a fresh page load would.
    setExternal(false);
    setExternalLoading(false);
    setExternalHits(null);
    setExternalCost(null);
  }, []);

  useImperativeHandle(ref, () => ({ reset: resetToIdle }), [resetToIdle]);

  /*
   * `pushState`/`replaceState` above only move the address bar — the app
   * never actually navigates, so nothing else puts this component's state
   * back in sync when the back or forward button changes the URL under it.
   * Back to `/` means back to the empty start page; forward to a permalink
   * this session already produced restores it from `lastCompletedRef`
   * instead of re-fetching, since nothing about a finished search changes
   * by revisiting it.
   */
  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      if (path === "/") {
        resetToIdle();
        return;
      }
      const match = /^\/s\/([^/]+)\/?$/.exec(path);
      const saved = lastCompletedRef.current;
      if (match && saved && saved.slug === match[1]) {
        abort.current?.abort();
        setPhase("done");
        setQuestion(saved.question);
        setFilter(saved.filter);
        setSearched(saved.filter);
        setPassages(saved.passages);
        setOpen(
          saved.passages.length
            ? new Set([saved.passages[0].chunkId])
            : new Set(),
        );
        setError(null);
        setDeclined(null);
        setReading(null);
        setEditing(false);
        setSlug(saved.slug);
        setCost(saved.cost);
        setDurationMs(saved.durationMs);
        setCorpusGrowth(saved.corpusGrowth);
        setCachedPrompt(saved.cachedPrompt);
        // `lastCompletedRef` never carries external hits — the step is
        // never saved, live or in this session's own history (see
        // `CompletedSearch`) — so stepping forward to an answer shows it
        // without this section, the same as reopening its permalink would.
        setExternalLoading(false);
        setExternalHits(null);
        setExternalCost(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [resetToIdle]);

  const showResults = phase !== "idle";
  /*
   * Once an answer is on screen, the box that asked for it gives way to the
   * "recently asked" list in the page's margin — that's the second way to
   * ask something else, and the box and the answer no longer compete for
   * the same width. Still shown while a search is in flight or failed:
   * "done" is the only phase that actually put a search on screen, and an
   * error needs the box back to retry from, not a dead end. `editing` is
   * the third way: clicking the question below brings the box back even
   * though the phase itself is still "done".
   */
  const showSearchBox = phase !== "done" || editing;

  // The shell above this component collapses the front page's masthead the
  // first time there's something below it to collapse for — see the prop's
  // own comment. Deliberately not gated on `editing`: reopening the box to
  // adjust a question is still a session with an answer on screen, and the
  // masthead shouldn't spring back open underneath it.
  useEffect(() => {
    onActiveChange?.(showResults);
  }, [showResults, onActiveChange]);

  return (
    <div className="space-y-8">
      {showSearchBox && (
        <SearchBox
          // Remounts when editing starts so its internal field state picks
          // up `initialValue` fresh — see that prop's own comment on why
          // this is a `key` change and not a controlled value.
          key={editing ? "editing" : "fresh"}
          onSearch={(prompt) => search(prompt, filter, external)}
          busy={busy}
          available={available}
          filter={filter}
          onFilterChange={setFilter}
          external={external}
          onExternalChange={setExternal}
          initialValue={editing ? question : undefined}
          estimate={searchEstimate}
        />
      )}

      {showResults && (
        <div className="space-y-8">
          {question && (
            /* Full accent color in the bar, not 40 percent of it: the line
               is the only thing separating the query from the answer below
               it, and a thinned-out accent on parchment gives a bar that
               isn't visible. */
            <div className="border-l-[3px] border-accent-600 pl-4">
              {/* Clickable only once the answer has actually landed and the
                  box isn't already open for it — the most common thing to
                  want after reading an answer is to adjust the question
                  that produced it, and until now the only way to do that
                  was retyping it from scratch in a fresh box. Plain text in
                  the two other states: mid-search there's nothing to edit
                  yet, and while the box is already reopened the question
                  here is a label for what's above it, not another way in. */}
              {phase === "done" && !editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  title={t("result.editQuestion")}
                  className="cursor-pointer text-left font-serif text-xl leading-snug text-ink-900 underline decoration-transparent decoration-dotted underline-offset-4 transition hover:text-accent-700 hover:decoration-accent-600/50"
                >
                  {question}
                </button>
              ) : (
                <p className="font-serif text-xl leading-snug text-ink-900">
                  {question}
                </p>
              )}
              {/* The cost sits next to the query and nowhere else: it's the
                  query that costs something, and the price should be visible
                  where the decision to ask another one is made — not in a
                  footnote at the bottom. The selection sits beside it for the
                  same reason: it belongs to what was asked, not to what came
                  back. Someone reading an answer with four poems in it should
                  be able to see that poetry was requested, not that the
                  corpus happened to answer that way. */}
              {/* A middle dot between every item, the same convention the
                  metadata row under every passage already uses (era ·
                  genre · locator) — this row mixed mono, sans, and an icon
                  with only a gap between them and read as three unrelated
                  fragments instead of one line about the same query. */}
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs text-ink-400">
                {cost && <CostTag cost={cost} />}
                {durationMs != null && (
                  <>
                    {cost && <span aria-hidden>·</span>}
                    <span className="font-mono tabular-nums">
                      {t("result.duration", { duration: m.duration(durationMs) })}
                    </span>
                  </>
                )}
                {isFiltered(searched) && (
                  <>
                    {(cost || durationMs != null) && <span aria-hidden>·</span>}
                    <span>{t("subjects.selected", { list: describe(searched) })}</span>
                  </>
                )}
                {/* The heading above is clickable too, but an underline that
                    only appears on hover is no affordance at all on touch —
                    this is the same action, spelled out, the same way
                    every other secondary action in the app gets a labeled
                    text button rather than relying on the reader to
                    discover it by chance. */}
                {phase === "done" && !editing && (
                  <>
                    {(cost || durationMs != null || isFiltered(searched)) && (
                      <span aria-hidden>·</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="cursor-pointer underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
                    >
                      {t("result.editQuestion")}
                    </button>
                  </>
                )}
              </div>
              {/* Only ever true on a *semantic* cache hit whose stored
                  wording actually differs (see `cachedPrompt`'s own
                  comment in searches.ts) — an exact hit only ever differs
                  by case, whitespace or punctuation, already treated as
                  the same question. Without this, the passages and
                  rationales below were computed for a question the reader
                  never actually typed, silently. */}
              {cachedPrompt && (
                <p className="mt-1.5 text-xs text-ink-400">
                  {t("result.cachedPrompt", { prompt: cachedPrompt })}
                </p>
              )}
              {/* Only ever true on a cache hit (see `corpusGrowth` on the
                  "done" event) — the archive answered instantly from an
                  older, smaller collection, and neither the exact cache nor
                  the semantic one otherwise has any way to say so. Never
                  refreshes on its own: the whole value of the cache is that
                  a repeat question is free, and that stays true unless this
                  is clicked. */}
              {corpusGrowth > 0 && (
                <p className="mt-1.5 text-xs text-ink-400">
                  {tn("result.corpusGrown", corpusGrowth)}{" "}
                  <button
                    type="button"
                    onClick={() => search(question, searched, external, true)}
                    className="cursor-pointer underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
                  >
                    {!isLocalModel(provider) && avgSearchUsd != null
                      ? t("result.searchAgainWithPrice", {
                          amount: `${m.usd(avgSearchUsd)} · ${m.sek(avgSearchUsd * rate)}`,
                        })
                      : t("result.searchAgain")}
                  </button>
                </p>
              )}
            </div>
          )}

          {busy && (
            <div>
              <p
                className="flex flex-wrap items-center gap-2 text-sm text-ink-400"
                role="status"
              >
                <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-accent-600 motion-reduce:animate-none" />
                {phase === "expanding"
                  ? t("phase.expanding")
                  : phase === "reading" && reading
                    ? tn("phase.reading", reading.works, {
                        passages: num(reading.count),
                      })
                    : t("phase.retrieving")}
                <span className="font-mono text-xs tabular-nums text-ink-400">
                  {m.duration(liveMs)}
                </span>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={cancelCurrentSearch}
                  className="cursor-pointer underline decoration-dotted underline-offset-4 transition hover:text-accent-700"
                >
                  {t("phase.cancel")}
                </button>
              </p>
              {/* A thin, rounded bar — `rounded-full` survives here under
                  design principle 5 the same way it does on `CostTag`'s
                  breakdown bars: the shape carries a meaning (progress), it
                  isn't decoration. Asymptotic toward 95%, never 100%: a
                  search's real duration varies run to run, and a bar that
                  can reach full while the wait continues reads as the app
                  lying about being almost done. No bar at all for a model
                  `MODEL_SEARCH_SECONDS` has no timing for — a guess with no
                  baseline is worse than none. */}
              {MODEL_SEARCH_SECONDS[provider] !== undefined && (
                <div
                  aria-hidden
                  className="mt-2 h-1 overflow-hidden rounded-full bg-parchment-200"
                >
                  <div
                    className="h-full rounded-full bg-accent-600 transition-[width] duration-1000 ease-linear"
                    style={{
                      width: `${95 * (1 - Math.exp(-(liveMs / 1000) / MODEL_SEARCH_SECONDS[provider]!))}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-accent-600/40 border-l-[3px] border-l-accent-600 bg-accent-600/8 px-5 py-4">
              <p className="font-medium text-accent-700">
                {t("result.errorTitle")}
              </p>
              <p className="mt-1 text-sm text-ink-600">{error}</p>
            </div>
          )}

          {/* Deliberately not the accent warning box above: nothing broke
              here, a guardrail worked as intended (the relevance check, or
              Claude's own refusal), so this reads as a plain statement —
              ink and parchment, the same neutral register the rest of the
              page's own text uses, no accent color at all. */}
          {declined && (
            <div className="rounded-lg border border-parchment-300 border-l-[3px] border-l-ink-400 bg-parchment-100 px-5 py-4">
              <p className="font-medium text-ink-700">
                {t("result.declinedTitle")}
              </p>
              <p className="mt-1 text-sm text-ink-600">{declined}</p>
            </div>
          )}

          {busy && (
            /* Three register rows, not three cards. The wait used to look
               like a dashboard loading (bordered, shadowed cards) while what
               was actually coming was the register the results list has used
               since the direction changed — a rule for the sheet's top edge,
               rows running the full width, no card holding them (see the
               list's own comment below). The wait should look like what it's
               waiting for, the same reasoning `ContextSheet`'s skeleton
               already follows for a single passage.

               Shown for the whole busy span, not just `retrieving`: the
               masthead above already collapses to its compact header the
               moment a search starts (see `onActiveChange`), and gating the
               skeleton to the second phase alone meant that collapse was
               immediately followed by a second layout change once retrieval
               began — one visible jump instead of two. */
            <div
              className="divide-y divide-parchment-200 border-t-2 border-accent-600"
              aria-hidden
            >
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-baseline gap-3 px-3 py-3">
                  <span className="mt-1 shrink-0 font-mono text-[0.6875rem] tabular-nums text-ink-400">
                    {i + 1}
                  </span>
                  <span className="mt-1 shrink-0 font-mono text-sm text-parchment-300">
                    +
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* Title, metadata, teaser — the same three lines the
                        real row shows collapsed. The pulse falls silent for
                        anyone who's asked for less motion, the same rule
                        `globals.css` already gives the menu's animations. */}
                    <span className="block h-4.25 w-2/5 animate-pulse rounded bg-parchment-100 motion-reduce:animate-none" />
                    <span className="mt-1.5 block h-3 w-1/4 animate-pulse rounded bg-parchment-100 motion-reduce:animate-none" />
                    <span className="mt-2 block h-3 w-11/12 animate-pulse rounded bg-parchment-100 motion-reduce:animate-none" />
                  </span>
                </div>
              ))}
            </div>
          )}

          {passages.length > 0 && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                {/* Section headings are set in ink-600, not the muted tone:
                    they're the page's second level, and a heading that's
                    lighter than the text below it stops being a heading.
                    `flex-1` here does the job `justify-between` did on the
                    row before it: the ruled hairline needs the heading
                    itself to claim the space up to the sort controls, so
                    the rule — not a gap — is what visibly separates them. */}
                <h2 className="eyebrow eyebrow-rule flex-1">
                  {tn("result.count", passages.length)}
                </h2>

                <div className="flex items-center gap-4 text-xs print:hidden">
                  {/* The same bordered strip `TextSizeSwitch` and
                      `LocaleSwitch` use, not the chip's own accent fill —
                      this reorders what's already the answer, it doesn't
                      narrow it, and sitting right next to
                      `subjects.selected` on the line above (a real
                      narrowing) it shouldn't be mistaken for another one. */}
                  <SegmentedControl
                    ariaLabel={t("sort.label")}
                    value={order}
                    onChange={setOrder}
                    segments={(["relevans", "kronologiskt"] as const).map(
                      (o) => ({ value: o, label: t(ORDER_KEY[o]) }),
                    )}
                  />

                  {/* Export is what's left in the row. "Open all" used to
                      stand here and opened sixteen passages at once — a wall
                      of text where the list is made to be read one passage
                      at a time. The permalink used to stand beside it, and it
                      copied the address already sitting in the address bar:
                      the stream rewrites it with `replaceState` once the
                      answer is done, so the link can be taken from there and
                      needed no button of its own. */}
                  <ExportMenu
                    filename={question}
                    /* `sorted`, not `passages` — the order and numbering in
                       the exported document should match what's actually
                       on screen (chronological order, work grouping) rather
                       than reranking's own relevance order underneath it. */
                    passages={sorted}
                    markdown={(l) =>
                      searchAsMarkdown(question, sorted, { locale: l })
                    }
                  />
                </div>
              </div>

              {/* The list is undivided. It used to carry a divider toward
                  "other candidates" — the passages retrieval turned up but
                  reranking didn't select — and that divider is no longer
                  drawn: the answer consists of the selection, and the path to
                  the rest is called "more like this" inside a passage. */}
              {/* No sheet: no fill, no border, no shadow. The list used to
                  sit inside a bordered, inset card so the hairlines between
                  rows would stop short of the edge and read as a leaf lying
                  on the paper rather than a table with sixteen cells. The
                  register direction wants exactly that table: a rule
                  standing in for the sheet's top edge, rows running the full
                  width, no card holding them.

                  The rule is the accent, not ink-800: it's the third link in
                  the chain the search box starts and the filter box carries
                  at 45 percent — full strength again here, because the
                  results are what the question was for. */}
              <div className="divide-y divide-parchment-200 border-t-2 border-accent-600">
                {sorted.map((p, i) => (
                  <PassageAccordion
                    key={p.chunkId}
                    passage={p}
                    /* The row's position in `sorted`, not `p.index` — that
                       field is fixed at retrieval time and stops matching
                       the row it's printed on the moment someone switches
                       to chronological order. This number is only ever the
                       register's own count of the rows in front of you. */
                    position={i + 1}
                    sameWorkAsAbove={i > 0 && sorted[i - 1].workId === p.workId}
                    open={open.has(p.chunkId)}
                    onToggle={() => toggle(p.chunkId)}
                    /* The query as it was asked, not what's currently in the
                       box: someone who's typed half of the next query
                       shouldn't have that half saved as the origin of the
                       passage they're reading now. */
                    search={{ slug, prompt: question }}
                  />
                ))}
              </div>
            </section>
          )}

          {phase === "done" && passages.length === 0 && !error && (
            <p className="text-sm text-ink-400">
              {isFiltered(searched)
                ? t("result.emptyFiltered", { list: describe(searched) })
                : t("result.empty")}
            </p>
          )}

          {/* Its own section, after the collection's own answer rather
              than mixed into it — see `ExternalSources`'s own comment on
              why a pointer outside the collection reads in a different
              register. Renders nothing at all when the checkbox was never
              on for this search (`ExternalSources` itself decides that from
              `externalHits`/`externalLoading`, not this call site). */}
          <ExternalSources
            hits={externalHits}
            loading={externalLoading}
            cost={externalCost}
          />
        </div>
      )}
    </div>
  );
});
