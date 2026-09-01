/**
 * Wall-clock time from query to answer on Claude — `expandQuery` →
 * `hybridSearch` (cross-encoder and spridningsfilter included) → `rerank`,
 * the same sequence `api/search/route.ts` runs when the switch is on
 * "claude". Same question as `.probe-local-timing.ts`
 * ("vad säger Kant om lögnen?") for a like-for-like figure next to the
 * local models' entries in `MODEL_SEARCH_SECONDS` (provider.ts).
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/.probe-claude-timing.ts
 *
 * COSTS MONEY — one real Claude call, ~$0.14 per the README's per-step
 * table (~$0.021 expansion + ~$0.12 reranking). Confirmed with the user
 * before running (2026-09-08); don't rerun this without asking again.
 * Actual: $0.1114, 123.7 s, 5 of 64 candidates selected.
 */
import { CANDIDATES, expandQuery, rerank } from "../src/lib/claude";
import { hybridSearch } from "../src/lib/search";
import { getDb, assertIndexed } from "../src/lib/db";

const QUESTION = "vad säger Kant om lögnen?";

async function main() {
  const db = getDb();
  assertIndexed(db);

  const start = performance.now();
  const plan = await expandQuery(QUESTION);
  const candidates = await hybridSearch({
    hypotheticalPassages: plan.hypotheticalPassages,
    keywords: plan.keywords,
    queries: plan.queries,
    mentions: plan.mentions,
    limit: CANDIDATES,
  });
  const result = await rerank(QUESTION, candidates);
  const seconds = (performance.now() - start) / 1000;
  const cost = plan.usage.cost + result.usage.cost;
  console.log(
    `RESULTAT claude\t${seconds.toFixed(1)} s\t${result.passages.length} valda av ${candidates.length}\t$${cost.toFixed(4)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
