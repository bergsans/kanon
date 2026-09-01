/**
 * Runs the local model and Sonnet against exactly the same candidate list on
 * the reranking step — same system prompt, same JSON schema (reused
 * from claude.ts, not copied), same 28 candidates per query. The only
 * axis that differs between the runs is which model makes the selection.
 *
 *   npx tsx scripts/.probe-rerank-local.ts
 *   npx tsx scripts/.probe-rerank-local.ts -- --model=qwen3:8b
 *
 * Requires Ollama running locally (localhost:11434) with the chosen model
 * pulled. The Sonnet calls cost real money (query expansion + reranking,
 * same as .probe-rerank-model.ts); the local model is free.
 */
import fs from "node:fs";
import { expandQuery, rerank } from "../src/lib/claude";
import { rerankLocal } from "../src/lib/local";
import { LOCAL_MODELS, type LocalModel } from "../src/lib/provider";
import { hybridSearch } from "../src/lib/search";
import { getDb, assertIndexed } from "../src/lib/db";

const arg = process.argv.find((a) => a.startsWith("--model="))?.slice("--model=".length);
if (arg && !(LOCAL_MODELS as readonly string[]).includes(arg)) {
  throw new Error(`Okänd modell "${arg}" — en av ${LOCAL_MODELS.join(", ")}`);
}
const LOCAL_MODEL: LocalModel = (arg as LocalModel) ?? "qwen3:14b";

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
const DIR =
  "/private/tmp/claude-501/-Users-bergsans-Documents-canon/b658b57a-5a3e-462f-9586-edce6fd172ad/scratchpad";
const PLANS = `${DIR}/plans-local.json`;
const SONNET_OUT = `${DIR}/rerank-claude-sonnet-5.json`;
const LOCAL_OUT = `${DIR}/rerank-${LOCAL_MODEL}.json`;

interface Row {
  question: string;
  chosen: { chunkId: number; author: string; title: string; relevance: string }[];
  candidates: number;
  cost: number;
}

function loadRows(path: string): Row[] {
  return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : [];
}

async function main() {
  assertIndexed(getDb());

  const saved: Record<string, { hypotheticalPassages: string[]; keywords: string[]; queryEn: string; mentions: string[] }> =
    fs.existsSync(PLANS) ? JSON.parse(fs.readFileSync(PLANS, "utf8")) : {};

  // Only replaces the local model's justifications with the correct num_ctx —
  // never touches Sonnet, so no new paid tokens.
  if (process.argv.includes("--local-only")) {
    const localRows: Row[] = loadRows(LOCAL_OUT);
    const localDone = new Set(localRows.map((r) => r.question));
    for (const question of PROBES) {
      if (localDone.has(question)) {
        console.log(`↷ redan klar: ${question}`);
        continue;
      }
      const plan = saved[question];
      const candidates = await hybridSearch({
        hypotheticalPassages: plan.hypotheticalPassages,
        keywords: plan.keywords,
        queries: { sv: question, en: plan.queryEn },
        mentions: plan.mentions,
        limit: CANDIDATES,
      });
      let local;
      try {
        local = await rerankLocal(question, candidates, LOCAL_MODEL);
      } catch (err) {
        console.log(`MISSAD (${LOCAL_MODEL}): ${question} — ${(err as Error).message}`);
        continue;
      }
      console.log(`${LOCAL_MODEL}  ${question}  →  ${local.passages.length} av ${candidates.length}, $0`);
      localRows.push({
        question,
        candidates: candidates.length,
        cost: 0,
        chosen: local.passages.map((p) => ({
          chunkId: p.chunkId,
          author: p.author,
          title: p.title,
          relevance: p.relevance,
        })),
      });
      fs.writeFileSync(LOCAL_OUT, JSON.stringify(localRows, null, 2));
    }
    return;
  }

  const sonnetRows: Row[] = loadRows(SONNET_OUT);
  const localRows: Row[] = loadRows(LOCAL_OUT);
  const done = new Set(sonnetRows.map((r) => r.question));

  for (const question of PROBES) {
    if (done.has(question)) {
      console.log(`↷ redan klar: ${question}`);
      continue;
    }

    if (!saved[question]) saved[question] = await expandQuery(question);
    const plan = saved[question];
    fs.writeFileSync(PLANS, JSON.stringify(saved, null, 2));

    const candidates = await hybridSearch({
      hypotheticalPassages: plan.hypotheticalPassages,
      keywords: plan.keywords,
      queries: { sv: question, en: plan.queryEn },
      mentions: plan.mentions,
      limit: CANDIDATES,
    });

    // A broad response can fill Sonnet's 16,000-token cap (see the comment at
    // CANDIDATES in claude.ts) and yield truncated, unparsable JSON. Already paid
    // for the call — if it fails, skip the query instead of
    // crashing the rest of the measurement and throwing away what's already paid for.
    let sonnet;
    try {
      sonnet = await rerank(question, candidates);
    } catch (err) {
      console.log(`MISSAD (sonnet): ${question} — ${(err as Error).message}`);
      continue;
    }
    console.log(
      `sonnet  ${question}  →  ${sonnet.passages.length} av ${candidates.length}, $${sonnet.usage.cost.toFixed(4)}`,
    );

    let local;
    try {
      local = await rerankLocal(question, candidates, LOCAL_MODEL);
    } catch (err) {
      console.log(`MISSAD (${LOCAL_MODEL}): ${question} — ${(err as Error).message}`);
      continue;
    }
    console.log(`${LOCAL_MODEL}  ${question}  →  ${local.passages.length} av ${candidates.length}, $0`);

    sonnetRows.push({
      question,
      candidates: candidates.length,
      cost: sonnet.usage.cost,
      chosen: sonnet.passages.map((p) => ({
        chunkId: p.chunkId,
        author: p.author,
        title: p.title,
        relevance: p.relevance,
      })),
    });
    localRows.push({
      question,
      candidates: candidates.length,
      cost: 0,
      chosen: local.passages.map((p) => ({
        chunkId: p.chunkId,
        author: p.author,
        title: p.title,
        relevance: p.relevance,
      })),
    });
    fs.writeFileSync(SONNET_OUT, JSON.stringify(sonnetRows, null, 2));
    fs.writeFileSync(LOCAL_OUT, JSON.stringify(localRows, null, 2));
  }

  console.log(`\n${"═".repeat(72)}`);
  let sumSonnet = 0,
    sumLocal = 0,
    sumOverlap = 0,
    sumUnion = 0;
  for (let i = 0; i < sonnetRows.length; i++) {
    const s = sonnetRows[i],
      l = localRows[i];
    const idsS = new Set(s.chosen.map((c) => c.chunkId));
    const shared = l.chosen.filter((c) => idsS.has(c.chunkId)).length;
    const union = new Set([...idsS, ...l.chosen.map((c) => c.chunkId)]).size;
    sumSonnet += s.cost;
    sumLocal += l.cost;
    sumOverlap += shared;
    sumUnion += union;
    console.log(
      `\n▸ ${s.question}\n  sonnet: ${s.chosen.length} valda · ${LOCAL_MODEL}: ${l.chosen.length} valda · gemensamma ${shared} av ${union}`,
    );
  }
  console.log(
    `\n${"═".repeat(72)}\nRESULTAT ${sonnetRows.length} frågor · sonnet $${sumSonnet.toFixed(4)} · ` +
      `${LOCAL_MODEL} $0 · överlapp ${sumOverlap}/${sumUnion} (${((sumOverlap / sumUnion) * 100).toFixed(0)} %)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
