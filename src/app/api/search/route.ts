import crypto from "node:crypto";
import {
  CANDIDATES,
  describeError,
  expandQuery,
  findExternal,
  IncompleteAnswerError,
  MODEL,
  rerank,
} from "@/lib/claude";
import { assertIndexed, getDb } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { expandQueryLocal, LOCAL_CANDIDATES, rerankLocal } from "@/lib/local";
import { costPayload, usdSek } from "@/lib/money";
import { DEFAULT_EFFORT, isLocalModel } from "@/lib/provider";
import { getEffort, getProvider } from "@/lib/provider-server";
import { hybridSearch, type Candidate } from "@/lib/search";
import { registerSearch, unregisterSearch } from "@/lib/search-registry";
import {
  corpusGrowthSince,
  findCached,
  normalizePrompt,
  saveSearch,
} from "@/lib/searches";
import { toPassagePayload } from "@/lib/corpus";
import { textHash } from "@/lib/hash";
import { NO_FILTER, parseFilter, type CorpusFilter } from "@/lib/taxonomy";
import {
  SEARCH_TOKEN_HEADER,
  type CostStep,
  type ExternalHit,
  type SearchEvent,
} from "@/lib/protocol";

// better-sqlite3 and onnxruntime are native — this route cannot run on the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same cap as the text box's `maxLength` — the two must not be able to drift apart. */
const MAX_PROMPT = 1000;

export async function POST(req: Request) {
  // Errors from here are shown in the UI and must be in the same language as it.
  // The query and the answer are untouched: expansion and reranking are Swedish
  // calls regardless of which locale the reader chose, and the cache is shared
  // across locales.
  const locale = await getLocale();
  // Which model the whole chain below runs on — the same choice all the
  // way through, a single query never mixes Claude's and a local model's
  // answers, or two local models' answers.
  const modelId = await getProvider();
  const local = isLocalModel(modelId);
  // Only Claude's reranking call takes an effort level (see `Effort` in
  // provider.ts) — local models never call `effort` at all. Read
  // unconditionally anyway: it's a cookie read, not worth branching on.
  const effortLevel = await getEffort();
  // Threaded into every LLM call below — but deliberately NOT `req.signal`.
  // The pipeline used to abort the moment the client disconnected (a new
  // search, a page change, a reload), which also skipped `saveSearch` for
  // an answer that had already been paid for. Now the only thing that can
  // abort a search once it starts is the explicit Avbryt button, reaching
  // this exact run through `searchToken` via `POST /api/search/cancel` —
  // see `search-registry.ts`. A client that stops reading the stream still
  // gets a search that finishes and lands in the archive. Minted after the
  // request body is validated below, not here: a malformed request returns
  // before ever reaching the stream, and a token registered for it would
  // never be unregistered.
  const pipelineAbort = new AbortController();
  const signal = pipelineAbort.signal;
  const expand = local
    ? (p: string, f?: CorpusFilter) => expandQueryLocal(p, modelId, f, signal)
    : (p: string, f?: CorpusFilter) => expandQuery(p, f, signal);
  const rerankFn = local
    ? (p: string, c: Candidate[], f?: CorpusFilter) =>
        rerankLocal(p, c, modelId, f, signal)
    : (p: string, c: Candidate[], f?: CorpusFilter) =>
        rerank(p, c, f, signal, effortLevel);
  // "medium" is the cache key Claude answers have always used — leaving it
  // bare there means every search saved before this dial existed still
  // hits. Only a non-default choice earns its own bucket, the same guard
  // `findCached`/`saveSearch` already apply between Claude and local models.
  const model = local
    ? modelId
    : effortLevel === DEFAULT_EFFORT
      ? MODEL
      : `${MODEL}:${effortLevel}`;

  let prompt: string;
  // The genre/era selection: empty = the whole corpus. `parseFilter` strips out
  // unknown names and normalizes the order, so the cache key stays the same
  // regardless of which order the chips were clicked in.
  let filter: CorpusFilter = NO_FILTER;
  // Skips `findCached` below when true — the one way to re-run a question
  // the archive would otherwise answer instantly, sent from the "Sök på
  // nytt" button next to a cache hit whose collection has since grown (see
  // `corpusGrowth` on the `done` event). Never automatic: the whole point
  // of the cache is that a repeat question costs nothing, and that stays
  // true unless the reader explicitly asks to pay for a fresh answer.
  let fresh = false;
  // The "utanför samlingen" checkbox — see `findExternal` in claude.ts.
  // Off by default like every other opt-in cost in this app (the local
  // model, a translation): checking it is the one action that spends money
  // on a question that isn't even about the collection.
  let external = false;
  try {
    const body = (await req.json()) as {
      prompt?: unknown;
      genres?: unknown;
      eras?: unknown;
      fresh?: unknown;
      external?: unknown;
    };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    filter = parseFilter(body);
    fresh = body.fresh === true;
    external = body.external === true;
  } catch {
    return Response.json(
      { error: t(locale, "api.invalidJson") },
      { status: 400 },
    );
  }

  if (!prompt) {
    return Response.json(
      { error: t(locale, "api.emptyPrompt") },
      { status: 400 },
    );
  }
  if (prompt.length > MAX_PROMPT) {
    return Response.json(
      { error: t(locale, "api.promptTooLong", { max: MAX_PROMPT }) },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const searchToken = crypto.randomBytes(8).toString("base64url");
  registerSearch(searchToken, pipelineAbort);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // If the user navigates away mid-search the stream closes under us and
      // enqueue throws. That no longer stops the pipeline itself (see
      // `pipelineAbort` above) — it just stops trying to write to a reader
      // that's gone, quietly rather than spamming the server log.
      let closed = false;
      const send = (event: SearchEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };

      // The bill builds up as the pipeline runs. Declared here, outside the
      // try block below, so the catch block can still report what was
      // already spent when a Claude refusal cuts the pipeline short —
      // otherwise that cost would be paid for and then vanish from every
      // surface but the server log.
      const steps: CostStep[] = [];

      /**
       * Starts the external step, if the checkbox asked for it. Never
       * awaited here — only kicked off, so it runs alongside retrieval and
       * reranking instead of after them, the same reason `candidates` and
       * `passages` stream before the search finishes.
       *
       * Called once scope is established: on a cache hit (an archived
       * answer already proves the question was in scope) or right after
       * `plan.inScope` passes for a fresh search — never before, so a
       * question the relevance guardrail declines never starts a paid web
       * search on its way to being declined anyway.
       *
       * `findExternal` is deliberately never cached (see its own comment in
       * claude.ts), so this runs fresh every time the box is checked,
       * cache hit or not — the collection's own cache says nothing about
       * whether a live web search has changed since.
       */
      const startExternal = () =>
        external
          ? findExternal(prompt, signal).catch((err) => {
              // A genuine request failure (network, auth, rate limit) —
              // `findExternal` itself already turns a parseable-but-broken
              // response into a real cost with empty hits, so reaching this
              // catch means nothing was billed at all. A bonus step, not
              // the answer: shouldn't take an otherwise finished search
              // down with it, resolved as empty rather than left to hang.
              console.error("[search] extern sökning misslyckades:", err);
              return { hits: [] as ExternalHit[], usd: 0 };
            })
          : null;

      /**
       * Set by `startExternal` inside the try block below — declared out
       * here so `finishExternal` in `finally` can reach whichever branch of
       * the try block set it, however that branch exited.
       */
      let externalPending: ReturnType<typeof startExternal> = null;
      let externalSent = false;

      /**
       * Sends the external step's result — exactly once, no matter which
       * branch of the try block below ran or how it exited. Called only
       * from `finally`, not scattered across every early return the way an
       * earlier draft had it: those call sites could only cover the exits
       * that remembered to make the call, and one that didn't — a
       * rate-limit error during expansion, before `startExternal` even
       * runs — left a checked box spinning forever on the client with
       * nothing ever coming. Awaiting `externalPending` here always
       * resolves (`startExternal`'s own `.catch` above sees to that), so
       * there's nothing left needing its own error handling at this level.
       *
       * `externalPending` being unset doesn't mean nothing to report: a
       * question the relevance guardrail declines never starts the step at
       * all (see `startExternal`'s own comment), and the checked box still
       * needs a definite answer instead of silence — so that case sends an
       * empty result too, the same as a search that ran and found nothing.
       */
      const finishExternal = async () => {
        if (externalSent || !external || signal.aborted || closed) return;
        const result = externalPending
          ? await externalPending
          : { hits: [] as ExternalHit[], usd: 0 };
        externalSent = true;
        // Re-checked after the await: cancellation can land while this was
        // waiting on `externalPending`, same guard `send` itself applies.
        if (signal.aborted || closed) return;
        send({
          type: "external",
          hits: result.hits,
          usd: result.usd,
          rate: usdSek(),
        });
      };

      try {
        // 0. Has this query been asked before, on this same model? Then the whole chain below is already paid for.
        // Skipped entirely when `fresh` — see that variable's own comment.
        const cached = fresh ? null : await findCached(prompt, filter, model);
        if (cached) {
          externalPending = startExternal();
          send({ type: "plan" });
          send({ type: "passages", passages: cached.passages });
          send({
            type: "done",
            slug: cached.slug,
            cached: true,
            // This request cost nothing, but the answer cost something once.
            // Both numbers go out: the first is true of now, the second of the corpus.
            cost: costPayload(cached.steps, model, {
              cached: true,
              originalUsd: cached.cost,
            }),
            corpusGrowth: corpusGrowthSince(cached.corpusWorks),
            // Only when the stored wording actually differs — see
            // `findCached`'s own comment in searches.ts for why this
            // comparison alone already tells an exact hit from a semantic
            // one, with no separate flag needed for which route matched.
            cachedPrompt:
              normalizePrompt(cached.prompt) !== normalizePrompt(prompt)
                ? cached.prompt
                : undefined,
          });
          // Not `controller.close()` here — the external step (kicked off
          // above) may still be pending, and closing the stream before
          // `finally` runs `finishExternal()` makes its `send()` enqueue
          // onto an already-closed controller, where the throw is swallowed
          // and the checked box spins forever. `finally` closes the stream
          // once, after the external result has gone out.
          return;
        }

        // Checked before the paid expansion call, not left for `hybridSearch`
        // to discover: a query against an empty corpus can never succeed, and
        // there's no reason to spend ~$0,021 finding that out.
        assertIndexed(getDb());

        // Measured from here, not from the top of the handler: a cache hit
        // returns above this line and never reaches it, so the clock only
        // ever times a search that actually ran the pipeline.
        const startedAt = Date.now();

        // 1. The model translates the query into hypothetical passages, keywords, and names.
        const plan = await expand(prompt, filter);
        steps.push(plan.usage);
        // The reader gave up while that call was in flight — `expand` itself
        // stopped early (see `signal` above), so nothing more here is worth
        // starting: not the next expensive step, and not a `saveSearch` row
        // for an answer nobody will read.
        if (signal.aborted) return;

        // The relevance guardrail: a question with no plausible reading as
        // one for this collection (see `inScope`'s own doc comment on
        // `QueryPlan` — "what is 4 + 4" rather than an unusual but genuine
        // one) stops here, before the pipeline's two expensive remaining
        // steps, retrieval and reranking. Folding the check into the
        // expansion call, rather than a separate one, is what keeps this
        // guardrail from adding its own line to the bill — but the
        // expansion call itself is billed either way, so that cost still
        // goes out with the decline, the same way `done` carries it for a
        // resultless query below. No `saveSearch`: there's no answer to
        // archive.
        if (!plan.inScope) {
          send({
            type: "declined",
            message: t(locale, "claude.outOfScope"),
            cost: costPayload(steps, model, { cached: false }),
          });
          // See the cache-hit branch above: `finally` closes the stream,
          // not here — the external step never started for a declined
          // question, but `finishExternal` still owes the checked box a
          // definite (empty) answer instead of silence.
          return;
        }
        send({ type: "plan" });
        externalPending = startExternal();

        // 2. Hybrid retrieval + local reranking — no LLM, all in-process.
        //
        // The candidate count is smaller for a local model: `LOCAL_CANDIDATES`
        // is the only pool size `.probe-rerank-local.ts` ever measured for one
        // (see local.ts) — Claude's `CANDIDATES` was raised afterward and a
        // local model never rode along with a re-measurement.
        const candidates = await hybridSearch({
          hypotheticalPassages: plan.hypotheticalPassages,
          keywords: plan.keywords,
          // The query in all of the corpus's languages — `expandQuery` fills
          // in the Swedish from the prompt itself, so this line no longer
          // carries any language knowledge.
          queries: plan.queries,
          mentions: plan.mentions,
          filter,
          limit: local ? LOCAL_CANDIDATES : CANDIDATES,
        });

        if (signal.aborted) return;

        if (candidates.length === 0) {
          send({ type: "passages", passages: [] });
          // The expansion ran and cost something, even though the search
          // returned nothing. Showing zero here would pretend that a
          // resultless query is free.
          send({
            type: "done",
            slug: null,
            cached: false,
            cost: costPayload(steps, model, { cached: false }),
          });
          // See the cache-hit branch above: `finally` closes the stream,
          // after `finishExternal` has had its chance to send.
          return;
        }

        // The longest wait in the chain comes next — `.probe-claude-timing.ts`
        // clocked a whole search at 123.7 s against ~12 s for retrieval — and
        // until now the reader had nothing to go on but a spinner. The numbers
        // are free: they're the list about to be sent.
        send({
          type: "candidates",
          count: candidates.length,
          works: new Set(candidates.map((c) => c.workId)).size,
        });

        // 3. The model selects and justifies.
        const { passages: selected, usage } = await rerankFn(
          prompt,
          candidates,
          filter,
        );
        steps.push(usage);
        if (signal.aborted) return;

        // Only Claude's selection goes out, in his order.
        //
        // The list used to also carry the rest of the candidates, below a
        // divider and without a rationale. The reasoning was that not being
        // selected isn't a judgment on the passage. That's still true, but it
        // turned the answer into a list where half the rows couldn't say why
        // they were there, and a row without a reason isn't an answer, it's a
        // search result.
        //
        // How many rows result is no longer fixed anywhere: the prompt asks
        // for every passage that answers, not for a count, so a narrow query
        // gives a short list and a broad one a long one. The only cap is
        // `CANDIDATES`.
        //
        // The rejected ones aren't discarded: they've gone through retrieval
        // and the cross-encoder, and the path to them is called "more like
        // this" — it's free and starts from the passage actually being read,
        // not from the query.
        const passages = selected.map((p, i) =>
          toPassagePayload(p, p.relevance, i + 1),
        );
        send({ type: "passages", passages });

        // 4. Save — a permalink for the user, a cache entry for the next
        // person asking the same thing. An error here must not take down an
        // answer that's already been delivered.
        //
        // Skipped when the cross-encoder itself fell back to fusion order
        // (`candidates.degraded`, see `crossRerank` in search.ts) — the same
        // table backs both the permalink and the cache lookup in
        // `findCached`, so saving here would archive a worse ranking as the
        // permanent answer to this question, served to everyone who asks it
        // again for as long as the row exists. The passages still went out
        // above; only the slug and the cache entry are foregone.
        let slug: string | null = null;
        if (candidates.degraded) {
          console.warn(
            "[search] not saved — cross-encoder fell back to fusion order:",
            prompt,
          );
        } else {
          try {
            slug = await saveSearch(
              prompt,
              // The same list that went out to the client: the permalink
              // should show the same page the searcher saw. The hash keeps it
              // that way across a re-index — see `textHash` on `PassageRef`.
              selected.map((p) => ({
                chunkId: p.chunkId,
                textHash: textHash(p.text),
                relevance: p.relevance,
              })),
              steps,
              filter,
              model,
              Date.now() - startedAt,
              // The query forms are archived along with the rest. They're
              // needed by "more from this work", which scores with the
              // cross-encoder and therefore needs the query in the passage's
              // own language — and they can't be recomputed afterward without
              // paying for a new expansion.
              plan.queries,
            );
          } catch (err) {
            console.error("[search] could not save the search:", err);
          }
        }

        send({
          type: "done",
          slug,
          cached: false,
          cost: costPayload(steps, model, { cached: false }),
        });
      } catch (err) {
        // A deliberate Avbryt, not a failure: the client already left "busy"
        // on its own the moment it sent the cancel request (see
        // `cancelCurrentSearch` in `CanonSearch.tsx`), so there's no error
        // to show and nothing here should look like a bug in the log.
        if (pipelineAbort.signal.aborted || closed) {
          // Nothing to do.
        } else if (err instanceof IncompleteAnswerError && err.reason === "refusal") {
          // Claude's own guardrail, not a bug either — the same "declined,
          // not broken" path the relevance check above uses, so the two
          // guardrails read the same way in the UI. Logged plainly, not as
          // an error: there's nothing here for an operator to investigate.
          console.log(`[search] ${describeError(err, locale)}`);
          send({
            type: "declined",
            message: describeError(err, locale),
            cost: costPayload(steps, model, { cached: false }),
          });
        } else {
          console.error("[search]", err);
          send({ type: "error", message: describeError(err, locale) });
        }
      } finally {
        // Sends the external step's result, if the checkbox asked for one —
        // see `finishExternal`'s own comment on why this single call
        // covers every way the try block above could have ended, including
        // ones an earlier draft's scattered per-branch calls missed.
        await finishExternal();
        unregisterSearch(searchToken);
        try {
          if (!closed) controller.close();
        } catch {
          // Already closed by the client — nothing to do.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Read by the client before it starts consuming the stream, so an
      // Avbryt click has a token to cancel — see `search-registry.ts`.
      [SEARCH_TOKEN_HEADER]: searchToken,
    },
  });
}
