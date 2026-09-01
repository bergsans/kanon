import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { EMBEDDING_DIM } from "./db";

/**
 * Multilingual embedding model — it's what makes it possible at all for a
 * Swedish question to hit English 19th-century prose. 384 dimensions,
 * ~120 MB, downloaded once and cached by transformers.js.
 */
export const MODEL_ID = "Xenova/multilingual-e5-small";

let pipe: Promise<FeatureExtractionPipeline> | null = null;

function getPipe(): Promise<FeatureExtractionPipeline> {
  pipe ??= pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
  return pipe;
}

/** Loads the model in advance so the first search doesn't pay for the ~5 s startup. */
export function warmup(): Promise<unknown> {
  return getPipe();
}

/**
 * E5 models are trained with role prefixes and measurably lose quality
 * without them. This is not cosmetic — "query: " and "passage: " respectively must be included.
 */
type Role = "query" | "passage";

async function encode(texts: string[], role: Role): Promise<Float32Array[]> {
  const extractor = await getPipe();
  const prefixed = texts.map((t) => `${role}: ${t}`);
  const output = await extractor(prefixed, { pooling: "mean", normalize: true });
  const flat = output.data as Float32Array;

  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    // Copy each row out — slicing the underlying buffer would otherwise
    // keep the whole batch alive.
    out.push(Float32Array.from(flat.subarray(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM)));
  }
  return out;
}

export async function embedPassages(texts: string[]): Promise<Float32Array[]> {
  return encode(texts, "passage");
}

export async function embedQuery(text: string): Promise<Float32Array> {
  const [v] = await encode([text], "query");
  return v;
}
