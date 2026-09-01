/**
 * Should `hybridSearch` embed its nine HyDE passages in one batch instead of
 * nine sequential calls to `embedQuery`? Free — local model only, no Claude.
 *
 *   pnpm tsx scripts/.probe-embed-batch.ts
 *
 * Reimplements `embed.ts`'s encode step directly rather than importing it,
 * so both paths can be timed and compared without changing the module under
 * measurement.
 *
 * Measured 2026-09-14, nine fixed passages in the collection's six
 * languages, mean of five runs after warmup, `next dev` running on the same
 * machine:
 *
 *   sequential  33 ms     batched  24 ms     min cos batched-vs-sequential  0.99938
 *
 * REJECTED. Nine milliseconds is nothing against a retrieval of ~12 s
 * (`BRANCH_LIMIT` in search.ts), and the batch does not give back the same
 * vectors: padding the shorter passages up to the batch's longest moves them
 * under the q8-quantized model. A change to every vector branch, bought for
 * a saving nobody would notice, is the wrong trade — see `hybridSearch` in
 * search.ts, which keeps the nine calls sequential on purpose.
 */
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/multilingual-e5-small";
const DIM = 384;

const PASSAGES = [
  "The sovereign power, being instituted by the consent of the multitude, hath the right to command obedience.",
  "The Germans, rude in manners, held hospitality sacred and counted the breach of it a crime.",
  "O fortune, thou that rulest the affairs of men, how cruelly dost thou cast down the proud!",
  "Spirit returns into itself through history, and each people is a moment in the progress of freedom.",
  "Staten har ingen annan rätt över medborgaren än den han själv har gett den.",
  "La liberté consiste à pouvoir faire tout ce qui ne nuit pas à autrui.",
  "Der Staat ist die Wirklichkeit der sittlichen Idee, der Fortschritt im Bewußtsein der Freiheit.",
  "Civitas nihil aliud est quam coetus multitudinis iuris consensu sociatus.",
  "La fortuna è arbitra della metà delle azioni nostre.",
];

const RUNS = 5;

async function encodeOne(extractor: FeatureExtractionPipeline, text: string): Promise<Float32Array> {
  const output = await extractor([`query: ${text}`], { pooling: "mean", normalize: true });
  return Float32Array.from((output.data as Float32Array).subarray(0, DIM));
}

async function encodeBatch(
  extractor: FeatureExtractionPipeline,
  texts: string[],
): Promise<Float32Array[]> {
  const output = await extractor(
    texts.map((t) => `query: ${t}`),
    { pooling: "mean", normalize: true },
  );
  const flat = output.data as Float32Array;
  return texts.map((_, i) => Float32Array.from(flat.subarray(i * DIM, (i + 1) * DIM)));
}

async function main() {
  const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
  await encodeOne(extractor, "warmup");

  let seqMs = 0;
  let batchMs = 0;
  let sequential: Float32Array[] = [];
  let batch: Float32Array[] = [];
  for (let r = 0; r < RUNS; r++) {
    let t = performance.now();
    sequential = [];
    for (const p of PASSAGES) sequential.push(await encodeOne(extractor, p));
    seqMs += performance.now() - t;

    t = performance.now();
    batch = await encodeBatch(extractor, PASSAGES);
    batchMs += performance.now() - t;
  }

  let minCos = 1;
  batch.forEach((v, i) => {
    let dot = 0;
    for (let j = 0; j < DIM; j++) dot += v[j] * sequential[i][j];
    minCos = Math.min(minCos, dot);
  });
  console.log(
    `sequential ${(seqMs / RUNS).toFixed(0)} ms   batched ${(batchMs / RUNS).toFixed(0)} ms   ` +
      `min cos batched-vs-sequential ${minCos.toFixed(5)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
