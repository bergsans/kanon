/**
 * Shared wire types between the client and the routes under `src/app/api/`.
 * `/api/search`'s response is NDJSON — one event per line — so the UI can
 * show the query interpretation while the reranking is still in progress;
 * `/api/context`'s is a single JSON object, `ContextWindowPayload` below.
 */

import type { Genre, Language, Source } from "./taxonomy";

/**
 * The header `/api/search` hands back its cancellation token on, read
 * before the client starts consuming the stream body. Named here, not in
 * the route itself: the route handler's module pulls in the Claude SDK and
 * better-sqlite3, and a client component may only import isomorphic code.
 */
export const SEARCH_TOKEN_HEADER = "X-Canon-Search-Token";

/**
 * One line on the bill: one of the four token kinds in a call.
 *
 * `perMillion` is carried all the way out to the UI and is not decoration.
 * A cache read costs a tenth of the input price and a cache write twenty-five
 * percent extra, and without the price in the table, a line with 8,000
 * tokens and a cost of $0.0016 looks like a math error.
 */
export interface CostLine {
  /** "inmatning" (input), "utmatning" (output), "cacheläsning" (cache read), "cacheskrivning" (cache write). */
  label: string;
  tokens: number;
  /** Dollars per million tokens for this specific line. */
  perMillion: number;
  cost: number;
}

/** One call to Claude, broken down into its lines. */
export interface CostStep {
  /** "frågeexpansion" (query expansion), "omrankning" (reranking), "översättning" (translation). */
  step: string;
  model: string;
  lines: CostLine[];
  cost: number;
}

/**
 * What a request cost, as the UI receives it.
 *
 * `usd` and `originalUsd` are kept apart for the cache hit's sake: an answer
 * from the archive costs nothing now, but it cost something once, and both
 * numbers say something. Showing only zero hides what it costs to ask the
 * collection; showing only the original would be a lie about this request.
 */
export interface CostPayload {
  steps: CostStep[];
  /**
   * Which model answered — Claude's model id, or an Ollama tag. Carried as
   * its own field rather than read off `steps[0].model`: a resultless query
   * still has an expansion step and so still has a model, but a search saved
   * before the breakdown existed has no steps at all, and the model must
   * still be shown then.
   */
  model: string;
  /** What this request cost. Zero when the answer came from the archive. */
  usd: number;
  /** What the answer cost when it was worked out the first time. */
  originalUsd: number;
  /** The rate the krona amount is computed with. The server's, so everyone sees the same number. */
  rate: number;
  cached: boolean;
}

export interface PassagePayload {
  index: number;
  chunkId: number;
  /**
   * The work the passage comes from. The payload didn't carry this before —
   * the list groups by author, not by work. The citation export needs it
   * anyway: BibTeX and RIS take works, not passages, and three passages from
   * the same book should become one entry. Without the key, dedup would have
   * to guess by author + title, and Gibbon's six volumes are named almost
   * but not quite the same thing.
   */
  workId: string;
  author: string;
  title: string;
  translator: string | null;
  genre: Genre;
  language: Language;
  source: Source;
  year: number;
  locator: string | null;
  text: string;
  /**
   * Claude's rationale, in Swedish.
   *
   * Never null. The payload used to also carry the candidates the reranking
   * *didn't* choose — with `relevance: null` and a line from the passage
   * itself as a preview — and the list drew a divider between the two
   * groups. That gave a list where half the rows lacked the one thing that
   * makes a row worth reading: the reason it's there. Now only the selection
   * goes out. The rejected candidates still exist in retrieval and in the
   * cross-encoder's scores; they just have no place in the answer.
   */
  relevance: string;
  /**
   * The work at the source. Litteraturbanken's editions are CC-BY: naming
   * the source and linking to it isn't a courtesy, it's the license condition.
   */
  sourceUrl: string | null;
}

/**
 * A pointer to a text outside the collection — never a passage.
 *
 * Sent only when the "utanför samlingen" checkbox was on. These are sources
 * the collection's own rights checks keep out (see `EXTERNAL_DOMAINS` in
 * claude.ts and `sources-marxists.md`): a page that exists and is free to
 * read, but that this app has no proven right to quote or store. So the
 * payload is a pointer, not a passage — author, title, the link Claude's web
 * search actually returned, and a short reason — and never the text itself.
 *
 * Never saved. `searches.ts`'s cache and permalink are deliberately about
 * the collection's own answer only — a pointer found by a live web search
 * is exactly as stale the moment it's written down as the search result it
 * came from, and a permalink that repeated it would be the app publishing a
 * quote about a page it never checked again. Checking the box on a saved
 * search's own page re-runs this step fresh, every time.
 */
export interface ExternalHit {
  author: string;
  title: string;
  url: string;
  /** Claude's rationale for why this page answers the question, in Swedish. */
  relevance: string;
}

export type SearchEvent =
  // Pure progress signal: the question is interpreted, the search begins. No
  // payload — the interpretation is no longer shown in the UI.
  | { type: "plan" }
  // Retrieval is done and the selection has started: how many candidates the
  // model is reading, and from how many works. Progress only — the passages
  // themselves arrive with `passages`.
  | { type: "candidates"; count: number; works: number }
  | { type: "passages"; passages: PassagePayload[] }
  // The external step's own result — sent exactly once whenever the
  // checkbox asked for one, whether or not it found anything and whether
  // or not the step actually ran (see `finishExternal` in the route: a
  // question the relevance guardrail declines never starts it, and still
  // gets an empty result here rather than a client left waiting forever).
  // Kept apart from `passages`: the two lists differ in kind, not just in
  // source, and merging them would let an unlicensed pointer read as a
  // member of the collection.
  //
  // Carries its own `usd`/`rate` rather than folding into the `done`
  // event's `CostPayload`: that type's `cached`/`originalUsd` pair means
  // "free now, paid once" (see the type's own comment), and this step is
  // the opposite — never cached, so always a real charge even when `done`
  // reports the rest of the answer as free. `rate` is carried here too,
  // even though most branches that send `external` already sent a `done`
  // or `declined` first with the same figure: the one branch that
  // doesn't — an unrelated pipeline error, `type: "error"`, carries no
  // `CostPayload` at all — would otherwise leave the client with no rate
  // to convert this charge to kronor with.
  | { type: "external"; hits: ExternalHit[]; usd: number; rate: number }
  // The slug is the search's permalink, /s/<slug>. `cached` says whether the
  // answer came from the archive instead of from Claude — then it cost
  // nothing. The bill comes along in the same event: it's only complete once
  // the last call has been paid for. `corpusGrowth` is only ever set on a
  // cache hit — the number of works added to the collection since this
  // answer was computed (0 or omitted: nothing to say). See
  // `corpusGrowthSince` in searches.ts. `cachedPrompt` is set only when a
  // *semantic* cache hit answered a differently-worded question than the
  // one actually typed — see `CacheHit` in searches.ts.
  | {
      type: "done";
      slug: string | null;
      cached: boolean;
      cost: CostPayload;
      corpusGrowth?: number;
      cachedPrompt?: string;
    }
  | { type: "error"; message: string }
  /**
   * A guardrail declined to answer — not a failure. Two causes: the
   * relevance check (`inScope` on `QueryPlan` in claude.ts, e.g. "what is
   * 4 + 4") or Claude's own refusal mid-reranking (`stop_reason:
   * "refusal"`, see `IncompleteAnswerError`). Kept apart from `error` so
   * the UI can render it without alarm styling — nothing broke, the app
   * chose not to proceed. Carries `cost` for the same reason `done` does on
   * a resultless query: the call that produced this decision was billed
   * either way, and showing nothing would make a declined question look
   * free.
   */
  | { type: "declined"; message: string; cost: CostPayload };

/**
 * Thrown by `readEvents` when a line doesn't parse as JSON — a proxy's error
 * page spliced into the stream, a truncated connection, or a response that
 * was never NDJSON at all. Its own class so the UI can tell "the server said
 * this" (a `SearchEvent`'s own, already-localized `error`/`declined`
 * message) apart from "the transport broke and handed back garbage" — the
 * latter used to surface as a raw `SyntaxError` ("Unexpected token <…"),
 * unlocalized and meaningless to the reader.
 */
export class ProtocolError extends Error {
  constructor(cause: unknown) {
    super("Malformed NDJSON line from /api/search");
    this.name = "ProtocolError";
    this.cause = cause;
  }
}

/** Reads an NDJSON stream and yields one event at a time. */
export async function* readEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SearchEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parse = (line: string): SearchEvent => {
    try {
      return JSON.parse(line) as SearchEvent;
    } catch (err) {
      throw new ProtocolError(err);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // The last chunk may be half a line — save it for the next round.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield parse(line);
      }
    }
    if (buffer.trim()) yield parse(buffer);
  } finally {
    reader.releaseLock();
  }
}

/**
 * What `/api/context` sends back — the passage with surrounding text, for
 * "show in context". The authoritative shape: `search.ts`'s own
 * `ContextWindow` (its return type before `sourceUrl` is added at the
 * route) is defined as `Omit<ContextWindowPayload, "sourceUrl">` against
 * this, rather than the two drifting apart, and the client (`ContextSheet`,
 * and `storyFixtures.ts`'s fixture for its story) imports this directly
 * instead of hand-copying it — a `import type` is erased at build time, so
 * a `"use client"` module can reference it without pulling `search.ts`'s
 * Node dependencies into the bundle.
 */
export interface ContextWindowPayload {
  workId: string;
  author: string;
  title: string;
  translator: string | null;
  year: number;
  language: Language;
  source: Source;
  /** Litteraturbanken's editions are CC-BY: the source must be credited and linked here too. */
  sourceUrl: string | null;
  locator: string | null;
  before: string;
  passage: string;
  after: string;
  /**
   * Whether the window has reached the work's start or end, respectively.
   * Without these, the panel can't remove its "read more" button when
   * there's nothing left to read, and clicking it gets an unchanged
   * response with no explanation why.
   */
  atStart: boolean;
  atEnd: boolean;
}
