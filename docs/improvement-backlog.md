# Improvement backlog

Findings from a full-repo review (pipeline/server, ingestion/generators, UI) that
were out of scope for the first pass — confirmed bugs and cheap wins, plus the
shared `scripts/lib/`/`src/lib/tei.ts` consolidation and the `eraOf` fix. Ordered
by area, not priority. Each line names the file and, where useful, points at the
comment or code that explains the finding in more depth.

## Ingestion

- **`src/lib/http.ts` — fetch with timeout, retry, and atomic cache writes.**
  Only `dta.ts` (`build-corpus-dta.ts:297-307`) has a timeout plus retry; every
  other fetch — `gutenberg.ts`, `litteraturbanken.ts`, `runeberg.ts`,
  `marxists.ts`, `perseus.ts`, `tcp.ts`, `wikisource.ts`, and each generator's
  own catalog loader — has neither. Every cache write is a plain
  `writeFileSync` straight to the final path, never write-then-rename, so a
  process killed mid-write leaves a truncated file that later runs treat as
  valid. The largest remaining item from the review: touches 8+ source
  modules that each fetch from a different real external service (GitHub raw,
  Litteraturbanken's API, Gutenberg, Wikisource's MediaWiki API, …), so a safe
  migration needs verifying each one against its actual source, not just a
  typecheck. Generators' `evaluate` catches (lang:223, dta:412, tcp:479,
  perseus:518, ws:386, mia:187) should also stop treating a transient network
  error as a permanent rejection once this exists — an `ECONNRESET` today
  drops a work from the manifest instead of retrying.
- **Rights checks that could be tightened** (flag only — don't loosen, and
  tightening could drop works already indexed, so this needs a decision, not
  a reflexive fix): `litteraturbanken.ts:69` accepts any `/^cc/i` license,
  though the generator only ever selects `"cc-0"` today. `wikisource.ts:312`
  bases its 70-year-post-mortem check on `work.year` from the manifest — the
  same file AGENTS.md already says can be hand-edited, which is exactly the
  trust boundary this kind of check exists to not depend on.
- **ID-collision behavior in `build-corpus.ts` and `build-corpus-sv.ts`.**
  These two don't call the shared `assertNoDuplicateIds` — they instead
  auto-suffix the *second* occurrence with the source's own ID
  (`build-corpus.ts` around the `usedIds` set, `build-corpus-sv.ts`
  similarly). Which work keeps the bare ID then depends on catalog processing
  order, silently. Left alone in this pass since it's a different, working
  mechanism, not a missing guard — but worth deciding whether it should also
  abort loudly instead.
- **`.probe-*.ts` typechecking.** Adding `"scripts/.*.ts"` to `tsconfig.json`
  surfaced 25+ errors across 7 files (`.probe-cache-store.ts`,
  `.probe-ddb-hathitrust.ts`, `.probe-progress-live.ts`,
  `.probe-progress-register.ts`, `.probe-rerank-local.ts`,
  `.probe-rerank-model.ts`, `.probe-search.ts`) — several look genuinely
  abandoned (calling functions with an outdated signature, e.g. a `queryEn`
  field `QueryPlan` no longer has) rather than just unchecked. Fixing each
  means understanding whether the probe is still meant to run at all;
  reverted rather than done piecemeal. `.probe-ruskin-order.ts` and
  `.probe-rerank-sanity.ts` also cite scripts that don't exist
  (`.probe-ruskin.ts`, `.probe-ruskin3.ts`) and should have those references
  fixed once this is tackled.
- **`.probe-orphans.ts`, `.probe-header-match.ts`, `.probe-author-collisions.ts`
  as regular scripts**, since AGENTS.md already prescribes running them as a
  normal part of the workflow (adding an author, changing an ID's shape) —
  they're tools, not measurements, and don't fit the `.probe-*` naming's own
  "a number that settled a question" meaning.
- **Ingest correctness**, smaller items not attempted here:
  - Half-indexed works are visible in vector search too, not just BM25 (the
    `chunk_count > 0` fix in this pass only covers the keyword branch — the
    vector branches read `vec_chunks` directly with no equivalent join).
  - Fetch → chunk → embed runs one work at a time; the next work's fetch
    could start while the current one embeds.
  - Perseus and TCP generators fetch from GitHub raw sequentially with no
    inherent rate-limit need to; could run concurrently.
  - 27 orphaned rows exist in the database today (`pnpm tsx
    scripts/.probe-orphans.ts`), all pre-existing TCP works unrelated to
    this pass's changes — not cleaned up here since that mutates `data/`.

## Server / pipeline

- **Split `src/lib/claude.ts`** (pricing/errors/expand/rerank-llm/external are
  five different concerns in one 1200-line file) **and `src/lib/search.ts`**
  (retrieval vs. `similarChunks`/`moreFromWork`/`getContext`, which don't need
  the embedding/rerank machinery the rest of the file pulls in).
- **Extract `runSearch` out of `route.ts`** — the `POST` handler's `start()`
  callback is ~300 lines mixing provider wiring, the external-search
  lifecycle, and the pipeline itself.
- **Retrieval in `worker_threads`**, with `signal.aborted` checked between
  branches and between cross-encoder batches (`rerank.ts`) — right now Avbryt
  during the ~12 s retrieval step only takes effect once it's done, and all
  the synchronous `better-sqlite3` work blocks the event loop for every other
  request in flight.
- **Batched `embedQuery` calls.** `hybridSearch` embeds its nine HyDE passages
  sequentially; batching needs its own probe first; per `.probe-embed-batch.ts`
  it moved the vectors it checked by up to 0.0006 cosine — not necessarily
  fine at this different scale/content, hence a probe rather than just doing it.
- **Semantic cache partitioning.** `vec_searches`' 5-neighbor KNN can spend its
  slots on rows the caller can never use (a different model, a different
  genre/era selection) — `model`/`genres`/`eras` as real columns the KNN
  filters on, instead of a post-hoc discard, would fix that.
- **A concurrency cap / daily spend guard** on the paid endpoints
  (`/api/search`, `/api/translate`, the external-search step) — nothing
  today limits how much a single session (or several at once) can spend.
- **The external step's cost never reaches `searches.cost`** (or `stats.ts`),
  so `/kostnader` under-reports real spend whenever the checkbox is used.
- **A heartbeat event in the NDJSON stream**, so a long silent stretch (the
  ~2-minute Claude rerank call, or 9 minutes on a local model) has something
  to distinguish "still working" from "the connection died" before the
  client-side fallback added in this pass (`result.streamEnded`) has to guess.
- **Shared `parseSteps`/env-parsers.** `parseSteps` is copied in `searches.ts`,
  `stats.ts` and `translate.ts` (a real constraint, not an oversight — `stats.ts`
  must stay free of `embed.ts`'s import chain); a small `cost-detail.ts` with
  no other dependencies would let all three use one copy.
- **Mention matching on a word boundary.** `mentionBranch`'s `LIKE '%term%'`
  with a 4-character floor matches "Mill" against "Miller" and "The Mill on
  the Floss."
- **An LRU for `getContext`**, which currently `fs.readFileSync`s the whole
  work's text (multi-MB for Gibbon) on every "show in context" click.

## UI

- **`CanonSearch.tsx` as a reducer + a `useSearchStream` hook.** The 19
  `useState`s and the repeated ~17-setter reset block (`search()`,
  `resetToIdle`, the popstate handler) are the single biggest simplification
  left in the component tree.
- **A shared `ui/Dialog`** — `ContextSheet` and `CostTag`'s `CostBreakdown`
  duplicate the same backdrop/Escape/scroll-lock/focus/header shell.
- **`NavMenu.tsx` as `role="dialog" aria-modal`**, using the already-shared
  `useModalFocus`, with real keyboard nav (arrow keys) in its listboxes.
- **Splitting server-only i18n keys out of the client bundle** —
  `LocaleProvider` currently ships the whole dictionary, `api.*`/`claude.*`
  included, to every client.
- **Lint** (Biome or oxlint) once `typescript-eslint`'s TypeScript 7 peer
  range issue is resolved upstream, or as an alternative that doesn't depend
  on it — see the comment at the bottom of `.github/workflows/ci.yml`.
- **`ROMAN_RE`** in `chunk.ts` uppercases ordinary words in some inputs
  ("DIX LETTRES" → "DIX Lettres") — needs its own probe/test pass, separate
  from the overlap-duplication fix in this pass.
