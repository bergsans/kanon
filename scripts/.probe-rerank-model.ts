/**
 * What the reranking step costs and picks, model by model.
 *
 *   npx tsx scripts/.probe-rerank-model.ts                       runs the active model
 *   CANON_MODEL=claude-haiku-4-5 npx tsx scripts/.probe-rerank-model.ts
 *   npx tsx scripts/.probe-rerank-model.ts --compare             compares saved runs
 *
 * The plans are computed ONCE, always on whichever model happened to run first, and
 * saved to disk. Otherwise two things would differ between the runs — both the
 * expansion and the selection — and the difference in outcome couldn't be attributed
 * to either one.
 */
import fs from "node:fs";
import { expandQuery, rerank, MODEL, type QueryPlan } from "../src/lib/claude";
import { hybridSearch } from "../src/lib/search";
import { getDb, assertIndexed } from "../src/lib/db";

const PROBES = [
  "vad är det goda livet?",
  "får staten begränsa individens frihet?",
  "ångest inför den egna friheten",
  "vad händer med själen efter döden?",
  "är makt viktigare än moral för en furste?",
  "civilisation kontra barbari",
  "vad säger Kant om lögnen?",
  "äktenskapet som en institution byggd på lögn",
];

const CANDIDATES = 28;
const DIR = "/private/tmp/claude-501/-Users-bergsans-Documents-canon/82278039-5fa2-4253-b3fe-5dee46170e4b/scratchpad";
const PLANS = `${DIR}/plans.json`;

interface Row {
  question: string;
  chosen: { chunkId: number; author: string; title: string; relevance: string }[];
  candidates: number;
  cost: number;
}

async function plansFor(): Promise<Record<string, QueryPlan>> {
  const saved: Record<string, QueryPlan> = fs.existsSync(PLANS)
    ? JSON.parse(fs.readFileSync(PLANS, "utf8"))
    : {};
  for (const q of PROBES) {
    if (!saved[q]) saved[q] = await expandQuery(q);
  }
  fs.writeFileSync(PLANS, JSON.stringify(saved, null, 2));
  return saved;
}

function compare() {
  const files = fs.readdirSync(DIR).filter((f) => f.startsWith("rerank-") && f.endsWith(".json"));
  const runs = files.map((f) => ({
    model: f.slice("rerank-".length, -".json".length),
    rows: JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8")) as Row[],
  }));
  if (runs.length < 2) {
    console.log("Behöver minst två körningar att jämföra. Kör om med CANON_MODEL satt.");
    return;
  }
  const [a, b] = runs;
  console.log(`\n${a.model}  mot  ${b.model}\n${"═".repeat(72)}`);
  let sumA = 0, sumB = 0, sumOverlap = 0, sumUnion = 0;
  for (let i = 0; i < a.rows.length; i++) {
    const ra = a.rows[i], rb = b.rows[i];
    const idsA = new Set(ra.chosen.map((c) => c.chunkId));
    const shared = rb.chosen.filter((c) => idsA.has(c.chunkId)).length;
    const union = new Set([...idsA, ...rb.chosen.map((c) => c.chunkId)]).size;
    sumA += ra.cost; sumB += rb.cost; sumOverlap += shared; sumUnion += union;
    console.log(
      `\n▸ ${ra.question}\n  ${a.model}: ${ra.chosen.length} valda, $${ra.cost.toFixed(4)}` +
        ` · ${b.model}: ${rb.chosen.length} valda, $${rb.cost.toFixed(4)}` +
        ` · gemensamma ${shared} av ${union}`,
    );
    const sample = rb.chosen.find((c) => idsA.has(c.chunkId));
    if (sample) {
      const same = ra.chosen.find((c) => c.chunkId === sample.chunkId)!;
      console.log(`    ${sample.author}, ${sample.title}`);
      console.log(`      ${a.model}: ${same.relevance}`);
      console.log(`      ${b.model}: ${sample.relevance}`);
    }
  }
  const n = a.rows.length;
  console.log(
    `\n${"═".repeat(72)}\n  ${n} frågor · ${a.model} $${sumA.toFixed(4)} · ` +
      `${b.model} $${sumB.toFixed(4)} · ` +
      `${sumA < sumB ? a.model : b.model} är ` +
      `${((1 - Math.min(sumA, sumB) / Math.max(sumA, sumB)) * 100).toFixed(0)} % billigare · ` +
      `överlapp ${sumOverlap}/${sumUnion} (${((sumOverlap / sumUnion) * 100).toFixed(0)} %)`,
  );
}

async function main() {
  if (process.argv.includes("--compare")) return compare();

  assertIndexed(getDb());
  const plans = await plansFor();
  const rows: Row[] = [];

  for (const question of PROBES) {
    const plan = plans[question];
    const candidates = await hybridSearch({
      hypotheticalPassages: plan.hypotheticalPassages,
      keywords: plan.keywords,
      queries: { sv: question, en: plan.queryEn },
      mentions: plan.mentions,
      limit: CANDIDATES,
    });
    const { passages, usage } = await rerank(question, candidates);
    console.log(
      `${MODEL}  ${question}  →  ${passages.length} av ${candidates.length} valda, ` +
        `$${usage.cost.toFixed(4)}`,
    );
    rows.push({
      question,
      candidates: candidates.length,
      cost: usage.cost,
      chosen: passages.map((p) => ({
        chunkId: p.chunkId,
        author: p.author,
        title: p.title,
        relevance: p.relevance,
      })),
    });
  }
  fs.writeFileSync(`${DIR}/rerank-${MODEL}.json`, JSON.stringify(rows, null, 2));
  console.log(`\nSparat till rerank-${MODEL}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
