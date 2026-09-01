/**
 * Wall-clock time from query to answer for each local model — the exact
 * sequence `api/search/route.ts` runs for one: `expandQueryLocal` →
 * `hybridSearch` (cross-encoder and spridningsfilter included) →
 * `rerankLocal`. Free: every step calls the local model, never Claude.
 *
 *   npx tsx scripts/.probe-local-timing.ts
 *   npx tsx scripts/.probe-local-timing.ts --model=qwen3:8b   one model only
 *
 * One question, one full run per model — a single figure, not a benchmark.
 * Feeds `MODEL_SEARCH_SECONDS` in provider.ts along with
 * `.probe-claude-timing.ts`'s Claude figure; see that constant's comment for
 * the full measurement and its caveats (candidate counts differ per model,
 * two of the three mlx quantizations fail outright on a fraction of
 * attempts). An earlier version of this file timed `rerankLocal` alone
 * against a free/bare query plan (the question as-is, no HyDE) shared
 * identically across models — controlled, but it undercounted the real
 * wait (expansion and retrieval take time too) and timed qwen3:14b's empty
 * response rather than a typical one. This version uses each model's OWN
 * real `expandQueryLocal` output instead, exactly like production — every
 * model gets a genuinely different, model-specific candidate list, so the
 * numbers are realistic per model but no longer a strictly controlled
 * comparison between them.
 */
import { expandQueryLocal, LOCAL_CANDIDATES, rerankLocal } from "../src/lib/local";
import { LOCAL_MODELS, type LocalModel } from "../src/lib/provider";
import { hybridSearch } from "../src/lib/search";
import { getDb, assertIndexed } from "../src/lib/db";

const arg = process.argv.find((a) => a.startsWith("--model="))?.slice("--model=".length);
if (arg && !(LOCAL_MODELS as readonly string[]).includes(arg)) {
  throw new Error(`Okänd modell "${arg}" — en av ${LOCAL_MODELS.join(", ")}`);
}
const MODELS: LocalModel[] = arg ? [arg as LocalModel] : [...LOCAL_MODELS];

// The mention branch's own probe (see the README): guarantees real,
// relevant candidates in the list regardless of how the model's own HyDE
// passages turn out, so a slow or timid model still has something to
// select from and the run isn't dominated by an empty-output edge case.
const QUESTION = "vad säger Kant om lögnen?";

async function main() {
  const db = getDb();
  assertIndexed(db);

  for (const model of MODELS) {
    const start = performance.now();
    try {
      const plan = await expandQueryLocal(QUESTION, model);
      const candidates = await hybridSearch({
        hypotheticalPassages: plan.hypotheticalPassages,
        keywords: plan.keywords,
        queries: plan.queries,
        mentions: plan.mentions,
        limit: LOCAL_CANDIDATES,
      });
      const result = await rerankLocal(QUESTION, candidates, model);
      const seconds = (performance.now() - start) / 1000;
      console.log(
        `RESULTAT ${model}\t${seconds.toFixed(1)} s\t${result.passages.length} valda av ${candidates.length}`,
      );
    } catch (err) {
      const seconds = (performance.now() - start) / 1000;
      console.log(
        `RESULTAT ${model}\tMISSAD efter ${seconds.toFixed(1)} s\t${(err as Error).message}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
