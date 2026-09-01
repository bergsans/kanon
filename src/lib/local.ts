/**
 * Query expansion and reranking on a local model, instead of Claude — over
 * Ollama's `/api/chat` for the OLLAMA_MODELS, or an OpenAI-compatible
 * `/v1/chat/completions` for OPENAI_MODELS (e.g. mlx-serve). Same system
 * prompts, same JSON schemas, and same parsing as `claude.ts` —
 * `parseQueryPlan`/`parseRerankSelection` are reused, not copied, so every
 * path only differs in WHICH model answers and HOW the request is shaped,
 * not in how the answer is read.
 *
 * EXPERIMENTAL. Measured in `.probe-rerank-local.ts` against Sonnet, same
 * 28 candidates per question: qwen3:14b gave 38% shared selected passages
 * across eight questions (46/122), and one question ("får staten begränsa
 * individens frihet?") got zero passages selected despite strong
 * candidates being present. See the README for the full table. qwen3:8b,
 * gemma3:12b, and the OPENAI_MODELS are offered in the switch but not yet
 * measured the same way.
 */

import {
  EXPAND_SYSTEM,
  QUERY_PLAN_SCHEMA,
  RERANK_SCHEMA,
  RERANK_SYSTEM,
  filterLines,
  parseQueryPlan,
  parseRerankSelection,
  renderCandidates,
  zeroStep,
  type QueryPlan,
  type RerankResult,
} from "./claude";
import type { CostStep } from "./protocol";
import { isOpenAiModel, type LocalModel } from "./provider";
import type { Candidate } from "./search";
import { NO_FILTER, type CorpusFilter } from "./taxonomy";

const OLLAMA_URL = process.env.CANON_OLLAMA_URL ?? "http://localhost:11434/api/chat";

/**
 * mlx-serve's own default port. `CANON_MLX_URL` exists for the same reason
 * as `CANON_OLLAMA_URL`: the model usually runs on a different machine on
 * the LAN, not on localhost.
 */
const MLX_URL = process.env.CANON_MLX_URL ?? "http://localhost:8080/v1/chat/completions";

/**
 * mlx-serve ignores the bearer token's value but still requires the header
 * to be present — confirmed against a live server, which answered a
 * `Bearer dummy` request normally. `CANON_MLX_API_KEY` exists for a build
 * that does check it.
 */
const MLX_API_KEY = process.env.CANON_MLX_API_KEY ?? "dummy";

/**
 * How many candidates local reranking gets to read — separate from Claude's
 * `CANDIDATES` (64) in claude.ts.
 *
 * Not a new number: it's the one `.probe-rerank-local.ts` actually measured.
 * Both figures in this file's top comment — 38% shared passages and ~9
 * minutes per call — were taken "same 28 candidates per question" (see
 * above), back when 28 was also Claude's number. `CANDIDATES` was later
 * raised to 64 for Claude's recall (see its own comment in claude.ts), and
 * local reranking rode along to 64 without ever being re-measured there —
 * so today's local calls are slower than the documented ~9 minutes and of
 * unknown quality, not the same ones the numbers above describe. Using 28
 * here restores the only configuration anyone has actually measured for a
 * local model; the recall those 28 buy is claude.ts's own table (7/19 vs
 * 13/19 name requirements satisfied).
 */
export const LOCAL_CANDIDATES = 28;

/**
 * Ollama's default context is 4096 tokens per slot. Without raising it, the
 * server silently truncates the prompt and the model justifies passages it
 * never read: measured in the server log (n_ctx_slot=4096,
 * task.n_tokens≈2050) after a first run gave justifications describing the
 * wrong author for every candidate.
 *
 * 32768 stays as is, left alone on purpose: the README's rerank table
 * ("samma 28 kandidater ... med rätt kontextfönster") was measured with
 * `LOCAL_CANDIDATES` (28) and this exact number together. Shrinking it to
 * match 28's smaller prompt would save a little memory, but it would also
 * mean nobody has actually run the combination in production, after already
 * being burned once by a context window that was too small. Query expansion
 * needs far less but shares the same constant for simplicity.
 */
const NUM_CTX = 32768;

/**
 * The step costs nothing in dollars, but carries the model name so the
 * bill in the UI shows WHICH model answered — `zeroStep` in claude.ts
 * hardcodes Claude's `MODEL` and doesn't fit here.
 */
function localStep(step: string, model: LocalModel): CostStep {
  return { step, model, lines: [], cost: 0 };
}

/**
 * Calls Ollama in streaming mode and returns the assembled text.
 *
 * Not `stream: false`: Ollama then holds the whole response back until
 * generation finishes, and at ~6-9 tokens/s on CPU a broad response takes
 * longer than undici's built-in body timeout of 300s — that timeout sits
 * in the fetch layer and can't be raised via `AbortSignal`. Streaming
 * fetches one piece per token, so the connection is never idle.
 */
async function callOllama(
  model: LocalModel,
  system: string,
  user: string,
  schema: object,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    body: JSON.stringify({
      model,
      stream: true,
      format: schema,
      // qwen3 thinks by default: a trivial one-word test question took 104
      // output tokens with thinking on and 3 with it off — thinking is a
      // separate field the API returns alongside the actual answer, not
      // something the schema-constrained answer needs. That's the likely
      // reason reranking took ~9 minutes for one call on qwen3:14b. A model
      // without a "thinking" capability just ignores the field.
      think: false,
      options: { num_ctx: NUM_CTX },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    // The caller's signal is `pipelineAbort` from route.ts — it only fires
    // on an explicit Avbryt click, not on the browser disconnecting (see
    // `search-registry.ts`), so this isn't a defense against an abandoned
    // request but against a search someone actually cancelled. Without it,
    // Avbryt would leave a multi-minute Ollama call running to no purpose.
    // `AbortSignal.any` keeps the 20-minute ceiling as a backstop even when
    // the caller passes nothing.
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20 * 60 * 1000)])
      : AbortSignal.timeout(20 * 60 * 1000),
  });
  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  }
  if (!res.body) throw new Error("Ollama returned no response stream");

  let content = "";
  let buf = "";
  // Ollama's own failures (model not found, out of memory) arrive as a
  // 200 stream with one `{"error": "…"}` line rather than a non-2xx status
  // — the `res.ok` check above never sees them. Left unguarded, that line's
  // `.message` is `undefined`, `content` stays `""`, and the caller's
  // `JSON.parse("")` on the empty result fails with "Unexpected end of JSON
  // input" — the real cause replaced by a confusing one two layers up.
  const readLine = (line: string) => {
    if (!line.trim()) return;
    const obj = JSON.parse(line);
    if (typeof obj.error === "string") throw new Error(`Ollama: ${obj.error}`);
    if (obj.message?.content) content += obj.message.content;
  };
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += Buffer.from(chunk).toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) readLine(line);
  }
  if (buf.trim()) readLine(buf);
  return content;
}

/**
 * Same job as `callOllama` but against the OpenAI-compatible wire format:
 * streamed `data:`-prefixed SSE lines instead of newline-delimited JSON, and
 * `choices[0].delta.content` instead of `message.content`. Streamed for the
 * same reason as `callOllama` — a broad reranking response otherwise sits
 * behind undici's 300s body timeout.
 *
 * The schema is passed as OpenAI's `response_format.json_schema.strict`
 * shape, the convention most OpenAI-compatible servers implement — assumed,
 * not measured: no probe has confirmed mlx-serve actually enforces it
 * rather than silently ignoring it the way an unrecognized field would be.
 * If output starts coming back unparsable, that's the first thing to check.
 *
 * mlx-serve has also, intermittently and on every OPENAI_MODELS
 * quantization tried, returned a stream with a role-only opening delta and
 * then closed with `finish_reason: "stop"` and no content at all — `raw`
 * comes back `""` and the caller's `JSON.parse` throws "Unexpected end of
 * JSON input". Seen on 2 of `.probe-local-timing.ts`'s 3 attempts at
 * qwen-3.8-27b-8bit and 1 of 2 at qwen-3.8-27b-bf16, always succeeding on an
 * immediate retry of the exact same request — not a schema or prompt-size
 * problem (the retry is byte-for-byte identical), and not something this
 * file works around: a caller that wants resilience against it has to retry
 * itself.
 */
async function callOpenAi(
  model: LocalModel,
  system: string,
  user: string,
  schema: object,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(MLX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MLX_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "response", schema, strict: true },
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    // Same reason as `callOllama`'s signal — a client that's stopped
    // listening shouldn't keep mlx-serve busy for the minutes a reranking
    // call takes, and shouldn't produce a `saveSearch` row nobody asked for.
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20 * 60 * 1000)])
      : AbortSignal.timeout(20 * 60 * 1000),
  });
  if (!res.ok) {
    throw new Error(`mlx-serve ${res.status}: ${await res.text()}`);
  }
  if (!res.body) throw new Error("mlx-serve returned no response stream");

  let content = "";
  let buf = "";
  // Same "flush what's left in `buf`" step `callOllama` already takes: a
  // final `data:` line with no trailing newline was silently dropped here,
  // unlike there — the SSE framing means it's usually just `[DONE]`, but
  // whenever a server's last content delta lands without a closing
  // newline, this is where it went missing.
  const readLine = (line: string) => {
    const data = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!data || data === "[DONE]") return;
    const obj = JSON.parse(data);
    const delta = obj.choices?.[0]?.delta?.content;
    if (delta) content += delta;
  };
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += Buffer.from(chunk).toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) readLine(line);
  }
  if (buf.trim()) readLine(buf);
  return content;
}

function callLocal(
  model: LocalModel,
  system: string,
  user: string,
  schema: object,
  signal?: AbortSignal,
): Promise<string> {
  return isOpenAiModel(model)
    ? callOpenAi(model, system, user, schema, signal)
    : callOllama(model, system, user, schema, signal);
}

export async function expandQueryLocal(
  prompt: string,
  model: LocalModel,
  filter: CorpusFilter = NO_FILTER,
  signal?: AbortSignal,
): Promise<QueryPlan> {
  const raw = await callLocal(
    model,
    EXPAND_SYSTEM,
    prompt + filterLines(filter),
    QUERY_PLAN_SCHEMA,
    signal,
  );
  return {
    ...parseQueryPlan(raw, prompt),
    usage: localStep("frågeexpansion", model),
  };
}

export async function rerankLocal(
  prompt: string,
  candidates: Candidate[],
  model: LocalModel,
  filter: CorpusFilter = NO_FILTER,
  signal?: AbortSignal,
): Promise<RerankResult> {
  if (candidates.length === 0) {
    return { passages: [], usage: zeroStep("omrankning") };
  }
  const raw = await callLocal(
    model,
    RERANK_SYSTEM,
    `Fråga: ${prompt}${filterLines(filter)}\n\n` +
      `Kandidatstycken:\n\n${renderCandidates(candidates)}`,
    RERANK_SCHEMA,
    signal,
  );
  return {
    passages: parseRerankSelection(raw, candidates),
    usage: localStep("omrankning", model),
  };
}
