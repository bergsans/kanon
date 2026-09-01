/**
 * Local reranking with a cross-encoder.
 *
 * Hybrid retrieval ranks by position across two separate lists (RRF). It
 * therefore never knows how well a single passage answers this particular
 * question — only that it ranked high in some branch. A cross-encoder reads
 * the question and the passage *together* and produces a number for how well
 * they fit. It's too expensive to run against the whole collection and about
 * right for a hundred or so candidates — the exact figure is decided by
 * `RERANK_POOL` in search.ts, where the reason for the number is written down.
 *
 * Why it's worth an extra step: candidate text is the largest line on the
 * Claude bill. With a sharper preselection, reranking can be given twenty
 * passages instead of forty and still see better candidates — half the
 * cost, and a better pool to choose from.
 *
 * THE MODEL CHOICE IS MEASURED. The question is Swedish, the collection
 * mostly English, so the only thing that matters is whether the model holds
 * the languages together. Measured as the overlap between the same question
 * asked in Swedish and in English, across forty candidates from the indexed
 * collection:
 *
 *   cross-encoder/mmarco-mMiniLMv2-L12-H384-v1   8/10 in the top ten, Spearman 0.80
 *   Xenova/bge-reranker-base (q8)                4/10 in the top ten, Spearman 0.30
 *
 * The bge model is the larger one and better on paper, but the quantized
 * release collapses: every score lands below 0.002 and the ranking becomes
 * noise. mMiniLM is also twice as fast — 70 ms per pair versus 130 — and
 * that speed is wait time the user stands in. See
 * `scripts/.probe-rerank.ts` and `.bench-rerank.ts`.
 */
import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";

export const MODEL_ID =
  process.env.CANON_RERANK_MODEL ??
  "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1";

/**
 * The model only exists as fp32 at the provider. Asking for q8 would look
 * for a model_quantized.onnx that doesn't exist and fail on the fetch.
 *
 * Validated rather than cast: an unrecognized value (a typo, e.g. "fp16")
 * would otherwise surface only when the model tries to load, as an opaque
 * error from inside `@huggingface/transformers` instead of one that names
 * the env var at fault.
 */
const RERANK_DTYPES = ["fp32", "q8"] as const;
type RerankDtype = (typeof RERANK_DTYPES)[number];

function parsedDtype(raw: string | undefined): RerankDtype {
  if (raw === undefined) return "fp32";
  if ((RERANK_DTYPES as readonly string[]).includes(raw)) return raw as RerankDtype;
  throw new Error(
    `CANON_RERANK_DTYPE must be one of ${RERANK_DTYPES.join(", ")}, got "${raw}".`,
  );
}

const DTYPE = parsedDtype(process.env.CANON_RERANK_DTYPE);

/** Set CANON_LOCAL_RERANK=0 to disable the step entirely. */
export const ENABLED = process.env.CANON_LOCAL_RERANK !== "0";

/**
 * How many characters of the passage are fed in. Chunks are at most 1800
 * characters and the model's window takes 512 tokens, so most of it fits
 * anyway — but shorter input is measurably faster (94 ms per pair at 900
 * characters versus 130 at 1400), and a passage's case is rarely decided in
 * its last line.
 */
const MAX_CHARS = 1400;

/** More pairs per call doesn't help: 8 and 16 measured to the same time per pair. */
const BATCH = 16;

interface Encoder {
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
}

let encoder: Promise<Encoder> | null = null;

function getEncoder(): Promise<Encoder> {
  encoder ??= (async () => ({
    tokenizer: await AutoTokenizer.from_pretrained(MODEL_ID),
    model: await AutoModelForSequenceClassification.from_pretrained(MODEL_ID, {
      dtype: DTYPE,
    }),
  }))();
  return encoder;
}

/** Loads the model in advance so the first search doesn't pay for the startup. */
export function warmup(): Promise<unknown> {
  return ENABLED ? getEncoder() : Promise.resolve();
}

/**
 * Scores pairs of question and passage. The numbers lie between 0 and 1 and
 * are only comparable within the same call — it's a ranking, not a measurement.
 *
 * The question is sent per pair, not once for all: the collection is
 * bilingual, and an English passage is scored against the English form of
 * the question while a Swedish one is scored against the Swedish form. The
 * model handles both directions, but it handles its own language best.
 */
export async function scorePairs(
  pairs: { query: string; passage: string }[],
): Promise<number[]> {
  if (pairs.length === 0) return [];
  const { tokenizer, model } = await getEncoder();

  const scores: number[] = [];
  for (let i = 0; i < pairs.length; i += BATCH) {
    const slice = pairs.slice(i, i + BATCH);
    const inputs = await tokenizer(
      slice.map((p) => p.query),
      {
        text_pair: slice.map((p) => p.passage.slice(0, MAX_CHARS)),
        padding: true,
        truncation: true,
      },
    );
    const { logits } = await model(inputs);
    scores.push(
      ...(logits.sigmoid().tolist() as number[][]).map((row) => row[0]),
    );
  }
  return scores;
}
