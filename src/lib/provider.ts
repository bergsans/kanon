/**
 * Which model the chain (query expansion + reranking) runs on: Claude, or
 * one of several local models via Ollama.
 *
 * Isomorphic for the same reason as `i18n.ts`: imported by server
 * components, route handlers, and client components. The cookie is read in
 * `provider-server.ts`, not here.
 */
import { t, type Locale } from "./i18n";
import { money } from "./money";

/**
 * The Ollama tags offered in the switch. Each must actually be pulled
 * (`ollama pull <tag>`) — an entry here that isn't on the machine fails the
 * first time someone picks it, not at build time.
 */
export const OLLAMA_MODELS = ["qwen3:14b", "qwen3:8b", "gemma3:12b"] as const;

/**
 * Models served over an OpenAI-compatible `/v1/chat/completions` endpoint
 * instead of Ollama's `/api/chat` — all three entries are the same
 * mlx-serve model (MLX on Apple Silicon) at different quantizations, none
 * yet measured against Sonnet the way qwen3:14b is (see
 * `MODEL_SEARCH_SECONDS` and the README — that constant's figures are
 * timed, but not the selection quality). Point at a non-default host with
 * `CANON_MLX_URL` — see `.env.example`.
 */
export const OPENAI_MODELS = [
  "qwen-3.8-27b-bf16",
  "qwen-3.8-27b-8bit",
  "qwen-3.8-27b-6bit",
] as const;

/** The full switch list: every local model regardless of which protocol serves it. */
export const LOCAL_MODELS = [...OLLAMA_MODELS, ...OPENAI_MODELS] as const;

export type LocalModel = (typeof LOCAL_MODELS)[number];

/**
 * The full choice: Claude, or one specific local model. One value instead
 * of a provider flag plus a separate model name — the switch is a single
 * flat list, and "which model" already answers "local or not" (anything
 * that isn't "claude" is local).
 */
export type ModelId = "claude" | LocalModel;

export const MODEL_IDS: readonly ModelId[] = ["claude", ...LOCAL_MODELS];

/**
 * Claude is the default. The local models are experimental — see
 * `.probe-rerank-local.ts` and the README: qwen3:14b gave only 38% shared
 * passages with Sonnet (46/122 across eight questions) on the same
 * candidate list, and one question got zero passages selected despite
 * relevant candidates being present. No one should land on a local model
 * without choosing it themselves.
 */
export const DEFAULT_MODEL: ModelId = "claude";

/** The cookie the choice lives in. Read on the server, written by `setProvider`. */
export const PROVIDER_COOKIE = "canon-provider";

export function isModelId(value: unknown): value is ModelId {
  return MODEL_IDS.includes(value as ModelId);
}

/**
 * How hard Claude's reranking call thinks — `output_config.effort` in
 * `claude.ts`'s `rerank`. Only two of the SDK's five levels (see
 * `Anthropic.Messages.MessageCreateParams.OutputConfig`) are offered: those
 * are the two the app has ever run, so "medium" (the switch's default) is
 * exactly today's fixed behaviour and carries the same 124 s in
 * `MODEL_SEARCH_SECONDS.claude`. "low" is untimed and unmeasured for
 * selection quality — it exists as a manual dial for someone who wants to
 * knowingly trade rationale depth for speed, not as a recommendation.
 * Expansion's own call stays hardcoded at "low" (`claude.ts:575`): it was
 * never the slow step, so it isn't part of this dial.
 *
 * Local models don't take this parameter at all (`local.ts` never calls
 * `effort`), so the switch only has any effect while "claude" is selected.
 */
export type Effort = "low" | "medium";

export const EFFORT_LEVELS: readonly Effort[] = ["low", "medium"];

/** Today's fixed behaviour, unchanged by adding the dial. */
export const DEFAULT_EFFORT: Effort = "medium";

/** The cookie the choice lives in. Read on the server, written by `setEffort`. */
export const EFFORT_COOKIE = "canon-effort";

export function isEffort(value: unknown): value is Effort {
  return (EFFORT_LEVELS as readonly string[]).includes(value as string);
}

export function isLocalModel(id: ModelId): id is LocalModel {
  return id !== "claude";
}

/**
 * Whether a *stored* model string (`searches.model`, `CostPayload.model`) is
 * a Claude run — distinct from `isLocalModel` above, which tests the
 * `ModelId` cookie value ("claude", never "claude-sonnet-5"). A saved row
 * carries `MODEL` from claude.ts, always a "claude-…" id — the effort dial
 * only ever appends ":low", never changes the prefix. Assumed, not
 * measured: a custom `CANON_MODEL` could in principle be named otherwise.
 * `stats.ts`'s SQL encodes the same rule as `model like 'claude%'`, since a
 * query can't call this function — keep the two in agreement if this ever
 * changes.
 */
export function isClaudeModelName(model: string): boolean {
  return model.startsWith("claude");
}

/** Which of the two local wire protocols to speak — see `local.ts`. */
export function isOpenAiModel(id: LocalModel): boolean {
  return (OPENAI_MODELS as readonly string[]).includes(id);
}

/**
 * Approximate wall-clock time from query to answer, in seconds — the whole
 * chain (expansion + retrieval + reranking), not just the reranking call.
 * The switch's dropdown shows this so picking a model is an informed wait,
 * not a surprise one; Claude's entry is here for the same reason, even
 * though a few seconds' difference from the local models' minutes hardly
 * needs a warning — the dropdown shows one consistent kind of number for
 * every entry instead of a number for some and silence for others.
 *
 * An earlier version of this constant (`LOCAL_MODEL_RERANK_SECONDS`) timed
 * only `rerankLocal`, one call, against a free/bare query plan shared
 * identically across models. That undercounted badly: real users wait for
 * expansion and retrieval too, and on a local model those aren't free in
 * time even though they're free in dollars. It also happened to time
 * qwen3:14b's *empty* response (0 of 28 selected, every question tried)
 * rather than a typical one.
 *
 * These numbers instead come from running the real production sequence
 * once per model — `expandQueryLocal`/`expandQuery` → `hybridSearch` →
 * `rerankLocal`/`rerank`, exactly what `api/search/route.ts` runs — on one
 * question, "vad säger Kant om lögnen?" (chosen because the mention branch
 * guarantees real, relevant candidates regardless of how each model's own
 * HyDE expansion turns out): `.probe-local-timing.ts` for the six local
 * entries (free — every step calls the local model) and
 * `.probe-claude-timing.ts` for Claude (COSTS MONEY, ~$0.14 per run — only
 * run with the user's explicit go-ahead; don't rerun without asking again).
 * Measured 2026-09-08.
 *
 * Not a benchmark: one call per model, and they didn't select the same
 * NUMBER of passages (0–6 of 28 for the local models, 5 of 64 for Claude),
 * which by itself moves a decode-bound call's wall-clock time — part of the
 * spread below is generation length, not raw model or pipeline speed.
 * qwen-3.8-27b-8bit and qwen-3.8-27b-bf16 have each failed outright on
 * mlx-serve (empty response, "Unexpected end of JSON input") on roughly half
 * the attempts across this file's various measurement runs, always
 * succeeding on an immediate retry of the identical request — see the
 * caveat in `local.ts` above `callOpenAi`. The figures below are each the
 * one successful timing, not a reliability guarantee.
 */
export const MODEL_SEARCH_SECONDS: Partial<Record<ModelId, number>> = {
  claude: 124,
  "qwen3:14b": 419,
  "qwen3:8b": 577,
  "gemma3:12b": 321,
  "qwen-3.8-27b-bf16": 266,
  "qwen-3.8-27b-8bit": 169,
  "qwen-3.8-27b-6bit": 138,
};

/**
 * "Claude" or "Lokal (qwen3:14b)" — shared by the model switch in `NavMenu`
 * and the pre-search estimate under `SearchBox`, which used to each write
 * this inline and would otherwise drift apart the next time either changed.
 */
export function modelLabel(model: ModelId, locale: Locale): string {
  return model === "claude"
    ? t(locale, "provider.claude")
    : t(locale, "provider.local", { model });
}

/** "~2 min 4 s, fråga till svar" or "tid ej mätt" — see `MODEL_SEARCH_SECONDS`. Shared for the same reason as `modelLabel`. */
export function modelDuration(model: ModelId, locale: Locale): string {
  const seconds = MODEL_SEARCH_SECONDS[model];
  if (seconds === undefined) return t(locale, "provider.durationUnmeasured");
  return t(locale, "provider.durationMeasured", {
    duration: money(locale).duration(seconds * 1000),
  });
}
