import fs from "node:fs";
import path from "node:path";
import { pipeline } from "@huggingface/transformers";
import { chunkText } from "../src/lib/chunk";
import { TEXTS_DIR } from "../src/lib/db";

async function main() {
  const files = fs.readdirSync(TEXTS_DIR).filter((f) => f.endsWith(".txt")).slice(0, 4);
  const chunks: string[] = [];
  for (const f of files) {
    for (const c of chunkText(fs.readFileSync(path.join(TEXTS_DIR, f), "utf8"))) {
      if (!c.isFrontMatter && chunks.length < 192) chunks.push(c.text);
    }
    if (chunks.length >= 192) break;
  }
  const avg = Math.round(chunks.reduce((s, c) => s + c.length, 0) / chunks.length);
  console.log(`${chunks.length} riktiga stycken, snittlängd ${avg} tecken\n`);

  async function bench(label: string, batch: number, threads?: number) {
    const opts: Record<string, unknown> = { dtype: "q8" };
    if (threads) opts.session_options = { intraOpNumThreads: threads, interOpNumThreads: 1 };
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/multilingual-e5-small",
      opts as never,
    );
    const run = (slice: string[]) =>
      extractor(slice.map((t) => `passage: ${t}`), { pooling: "mean", normalize: true });

    await run(chunks.slice(0, batch)); // uppvärmning — allokeringar hör inte till mätningen

    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i + batch <= chunks.length; i += batch) {
      await run(chunks.slice(i, i + batch));
      n += batch;
    }
    const secs = (performance.now() - t0) / 1000;
    console.log(`${label.padEnd(24)} ${(n / secs).toFixed(1).padStart(6)} stycken/s`);
    await extractor.dispose();
  }

  const cases: [string, number, number | undefined][] = [
    ["batch 32 (nuvarande)", 32, undefined],
    ["batch 64", 64, undefined],
    ["batch 128", 128, undefined],
    ["batch 64 · 4 trådar", 64, 4],
    ["batch 64 · 8 trådar", 64, 8],
    ["batch 64 · 10 trådar", 64, 10],
  ];
  for (const [label, batch, threads] of cases) await bench(label, batch, threads);
}

main();
