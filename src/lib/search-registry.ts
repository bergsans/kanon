/**
 * In-flight searches, keyed by a token minted per request.
 *
 * `/api/search` used to tie the whole pipeline to the browser request's own
 * `signal`: the moment the client disconnected — a new search, a page
 * change, a reload — Claude's calls were aborted and `saveSearch` was never
 * reached. That was deliberate once, but it throws away paid work: the
 * query expansion has already been billed by the time anyone could leave,
 * and a finished answer nobody is watching live is still worth an entry in
 * the archive.
 *
 * The pipeline now runs to completion and saves regardless of what the
 * client does. The only thing that still cuts a search short is the
 * explicit Avbryt button, which has to reach the right in-flight run from a
 * separate request (`POST /api/search/cancel`) — hence a token instead of
 * reusing the original request's own `AbortSignal`.
 *
 * A plain map, not a database table: the app runs as one Node process (see
 * `db.ts`'s singleton handle), and an aborted search leaves nothing worth
 * persisting past that process's lifetime.
 *
 * Kept on `globalThis`, for the same reason as `db.ts`'s handle: `next
 * dev`'s hot reload re-evaluates this module without restarting the
 * process, which would otherwise reset the map to empty on every save — a
 * search started before the last reload becomes one Avbryt can never reach,
 * returning `cancelled: false` for a token that's still very much running.
 */
const globalForRegistry = globalThis as unknown as {
  __canonInFlight?: Map<string, AbortController>;
};
const inFlight = (globalForRegistry.__canonInFlight ??= new Map());

export function registerSearch(token: string, controller: AbortController): void {
  inFlight.set(token, controller);
}

/** Called from the route's `finally`, whether the search finished, failed, or was cancelled. */
export function unregisterSearch(token: string): void {
  inFlight.delete(token);
}

/** Returns false for a token that never existed or already finished — the caller has nothing to report either way. */
export function cancelSearch(token: string): boolean {
  const controller = inFlight.get(token);
  if (!controller) return false;
  controller.abort();
  inFlight.delete(token);
  return true;
}
