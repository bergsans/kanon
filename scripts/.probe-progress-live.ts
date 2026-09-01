/**
 * The whole chain once for real, for the query that started all this.
 *
 * The earlier probes in this family replicated the branches locally with a hand-written
 * plan: free, but they only measure what retrieval *can* do with a given
 * expansion. Two interventions have now been made in production code — a fourth HyDE register
 * in `EXPAND_SYSTEM` and `RERANK_POOL` raised 48 → 96 — and both are justified by numbers
 * that come out of a simulation. That Hegel sat at fusion rank 73 and that 73 < 96 is
 * not an observation that he actually appears in the answer.
 *
 * This is that observation. Two Claude calls, ~$0.035, the same path
 * `/api/search` takes: expandQuery → hybridSearch → rerank.
 */
import { expandQuery, rerank } from "../src/lib/claude";
import type { Candidate } from "../src/lib/search";
import { hybridSearch } from "../src/lib/search";

const PROMPT = "Sker framsteg i historien, eller inte?";
/** The same number route.ts passes on — otherwise we aren't measuring the app. */
const CANDIDATES = 28;
const TARGETS = ["Hegel", "Schopenhauer", "Nietzsche", "Kant", "Marx", "Engels"];

const usd = (n: number) => `$${n.toFixed(4)}`;
const mark = (author: string) =>
  TARGETS.some((t) => author.includes(t)) ? "«" : " ";

const t0 = Date.now();
const plan = await expandQuery(PROMPT);
const tPlan = Date.now() - t0;

console.log(`\n════ frågeexpansion  (${tPlan} ms, ${usd(plan.usage.cost)})`);
console.log(`  omformulering: ${plan.restatement}`);
console.log(`  engelsk fråga: ${plan.queryEn}`);
console.log(`  nämnda namn:   ${plan.mentions.length ? plan.mentions.join(", ") : "(inga)"}`);
console.log(`  nyckelord:     ${plan.keywords.join(", ")}`);
console.log(`\n  ${plan.hypotheticalPassages.length} hypotetiska stycken:`);
plan.hypotheticalPassages.forEach((p, i) => {
  console.log(`\n   ${"abcd"[i]}) ${p}`);
});

const t1 = Date.now();
const candidates = await hybridSearch({
  hypotheticalPassages: plan.hypotheticalPassages,
  keywords: plan.keywords,
  queries: { sv: PROMPT, en: plan.queryEn },
  mentions: plan.mentions,
  limit: CANDIDATES,
});
const tSearch = Date.now() - t1;

console.log(`\n════ hämtning + cross-encoder  (${(tSearch / 1000).toFixed(1)} s, gratis)`);
console.log(`  ${candidates.length} kandidater, ${new Set(candidates.map((c) => c.author)).size} författare\n`);
candidates.forEach((c, i) => {
  const score = c.crossScore === undefined ? "  –  " : c.crossScore.toFixed(3);
  console.log(
    ` ${mark(c.author)}${String(i + 1).padStart(2)}. ${score} [${c.sources.map((s) => s[0]).join("")}] ` +
      `${c.author} — ${c.title.slice(0, 50)}`,
  );
});

/** Where in the final candidate list the German thinkers ended up, if at all. */
function positions(list: { author: string }[]) {
  return TARGETS.map((t) => {
    const at = list
      .map((c, i) => (c.author.includes(t) ? i + 1 : 0))
      .filter(Boolean);
    return `${t} ${at.length ? at.join(",") : "—"}`;
  }).join("   ");
}
console.log(`\n  platser: ${positions(candidates)}`);

const t2 = Date.now();
const { passages, usage } = await rerank(PROMPT, candidates);
const tRerank = Date.now() - t2;

console.log(`\n════ Claudes urval  (${(tRerank / 1000).toFixed(1)} s, ${usd(usage.cost)})`);
console.log(`  ${passages.length} av ${candidates.length} valda\n`);
for (const p of passages) {
  console.log(` ${mark(p.author)}${p.index}. ${p.author}, ${p.title}${p.locator ? `, ${p.locator}` : ""}`);
  console.log(`     ${p.relevance}`);
}
console.log(`\n  platser: ${positions(passages as Candidate[])}`);

const total = plan.usage.cost + usage.cost;
console.log(
  `\n════ ${usd(total)} totalt · ${((Date.now() - t0) / 1000).toFixed(1)} s · ` +
    `${new Set(passages.map((p) => p.author)).size} röster i svaret\n`,
);
