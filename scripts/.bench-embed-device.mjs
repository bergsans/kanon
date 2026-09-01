/**
 * Throughput of the embedding model (`Xenova/multilingual-e5-small`) across
 * device/dtype combinations — the measurement behind the `dtype: "q8"` choice
 * hardcoded in `src/lib/embed.ts`.
 *
 *   node scripts/.bench-embed-device.mjs <device> <dtype>
 *   node scripts/.bench-embed-device.mjs cpu q8
 *   node scripts/.bench-embed-device.mjs cpu fp32
 *
 * Plain .mjs and not .ts run through tsx: `device`/`dtype` are passed as raw
 * strings to `pipeline()`, and a wrong combination should fail exactly the
 * way a hand-run experiment does, not be caught by a type first.
 */
const { pipeline } = await import("@huggingface/transformers");

const ONE = "But the greatest punishment of all is to be governed by a worse man, if one is not willing to govern oneself. ".repeat(10).slice(0, 1100);
const TEXTS = Array.from({ length: 96 }, (_, i) => `passage: ${ONE}${i}`);
const BATCH = 32;

const [device, dtype] = process.argv.slice(2);

try {
  const t0 = Date.now();
  const extractor = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", { device, dtype });
  const loadSeconds = ((Date.now() - t0) / 1000).toFixed(1);

  const t1 = Date.now();
  for (let i = 0; i < TEXTS.length; i += BATCH) {
    await extractor(TEXTS.slice(i, i + BATCH), { pooling: "mean", normalize: true });
  }
  const seconds = (Date.now() - t1) / 1000;

  console.log(`RESULT ${device}/${dtype}: ${(TEXTS.length / seconds).toFixed(1)} chunks/s (load ${loadSeconds}s)`);
} catch (err) {
  console.log(`RESULT ${device}/${dtype}: FAILED — ${String(err.message).slice(0, 140)}`);
}
