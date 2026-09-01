/**
 * Can the number of passages be controlled with the cross-encoder's score instead
 * of a fixed number?
 *
 * The chain today says "Claude picks 10–16 of 28", and the ceiling is `CANDIDATES`.
 * For the count to follow the question instead, something must cut on relevance,
 * and the only step with a relevance score per passage is the cross-encoder.
 *
 * BUT: `rerank.ts` explicitly says its scores are "only comparable within the same
 * call — it's a ranking, not a measurement". An absolute threshold therefore
 * contradicts the house's own documentation, and that's exactly why this
 * measurement exists instead of a guessed constant. Three forms are pitted against
 * each other over the gold standard's questions:
 *
 *   absolute   s >= T              guards against a question where everything is bad
 *   relative   s >= α · s_max      guards against a question whose whole distribution is low
 *   knee       largest jump        guards against a distribution with a knee instead of a level
 *
 * The floor is recall: a threshold that drops a must-have author from `gold.ts` is
 * wrong regardless of how good the distribution looks. Then the spread in count
 * decides — a form that gives 30 passages on every question has achieved nothing.
 *
 * COST: retrieval and the cross-encoder are local and free. Only a question without
 * a saved plan costs anything (~$0.014 for the expansion). Without `--pay` the run
 * refuses to pay, and instead reports how many plans are missing.
 *
 *   pnpm tsx scripts/.probe-cross-threshold.ts          free, requires saved plans
 *   pnpm tsx scripts/.probe-cross-threshold.ts --pay    expand the ones that are missing
 */
import { assertIndexed, getDb } from "../src/lib/db";
import { hasPlan, planFor } from "../src/lib/plans";
import { diversify, hybridSearch, type Candidate } from "../src/lib/search";
import { check, GOLD, type GoldCase } from "./gold";

/**
 * How many candidates retrieval is asked to give.
 *
 * Equal to the proposed `RERANK_POOL`, not the proposed `CANDIDATES`: the
 * threshold must be measured on the whole list the cross-encoder actually reads,
 * because that's where it will sit. Measuring on an already-cut list measures the
 * cut.
 */
const POOL = 192;

/** The proposed ceiling — whatever the threshold lets through, no more than this goes to Claude. */
const CEILING = 64;

/**
 * The diversity filtering is done by `diversify` itself, not by a copy here.
 *
 * It carried its own implementation for as long as the measurement tried ceilings
 * the production code didn't have — and immediately paid the cost a copy always
 * costs: the ceiling rows ran at 7/9 straight through, even the row labeled
 * "today", which was therefore not today. Now that the shares live in
 * `search.ts`, the probe measures what actually runs.
 */
const perWorkAt = (limit: number) => Math.max(3, Math.round((limit * 3) / 28));
const perAuthorAt = (limit: number) => Math.max(4, Math.round((limit * 4) / 28));

/** The sweep. Same steps for both forms, so the tables can be laid side by side. */
const SWEEP = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6];

/**
 * The knee form's search window.
 *
 * Without a lower bound it always finds the jump between rank 1 and 2 — the
 * largest in a distribution that falls steeply — and answers "one passage" on
 * every question. Without an upper bound it searches in the noise at the bottom,
 * where the differences are random.
 */
const KNEE_MIN = 4;
const KNEE_MAX = 48;

const pay = process.argv.includes("--pay");

/** Where in the sorted list the jump is largest, expressed as the number of passages to keep. */
function knee(scores: number[]): number {
  let best = KNEE_MIN;
  let drop = -1;
  for (let i = KNEE_MIN - 1; i < Math.min(scores.length - 1, KNEE_MAX); i++) {
    const d = scores[i] - scores[i + 1];
    if (d > drop) {
      drop = d;
      best = i + 1;
    }
  }
  return best;
}

interface Outcome {
  /** Number of passages that went forward to Claude. */
  n: number;
  /** Satisfied and testable name requirements, respectively. */
  hits: number;
  required: number;
  /** Was a diversity requirement the answer key sets violated? */
  broke: boolean;
}

function outcome(
  gold: GoldCase,
  cut: Candidate[],
  indexedAuthors: Set<string>,
  limit = CEILING,
): Outcome {
  const final = diversify(cut, limit);
  const r = check(gold, final, indexedAuthors);
  return {
    n: final.length,
    hits: r.hits,
    required: r.required,
    broke: r.genresOk === false || r.swedishOk === false,
  };
}

const db = getDb();
assertIndexed(db);

const indexedAuthors = new Set(
  (db.prepare("select distinct author from works").all() as { author: string }[]).map(
    (r) => r.author,
  ),
);

const missing = GOLD.filter((g) => !hasPlan(g.question));
console.log(
  `\n  ${GOLD.length - missing.length}/${GOLD.length} frågor har sparad plan · ` +
    `${indexedAuthors.size} indexerade författare`,
);
if (missing.length > 0) {
  console.log(`  ${missing.length} saknar plan, ~$${(missing.length * 0.014).toFixed(3)} att expandera:`);
  for (const g of missing) console.log(`    – ${g.question}`);
  if (!pay) {
    console.log(`\n  Kör om med --pay för att betala för dem. Avbryter.\n`);
    process.exit(1);
  }
}

/** Summed per parameter over all questions — a single question says nothing. */
type Tally = { hits: number; required: number; broke: number; counts: number[] };
const empty = (): Tally => ({ hits: 0, required: 0, broke: 0, counts: [] });

const absolute = new Map(SWEEP.map((t) => [t, empty()]));
const relative = new Map(SWEEP.map((a) => [a, empty()]));
const kneeTally = empty();

/**
 * The baselines: just a ceiling, no threshold.
 *
 * 28 is today's chain. The others exist because a threshold must be compared
 * against the alternative it's meant to replace, not just against itself at other
 * parameters — and the alternative to "cut on score" is "let more through".
 * Without this row there's no way to see whether the threshold wins anything or
 * just cuts away what a wider ceiling would have given for free.
 */
const CEILINGS = [28, 48, 64, 96];
const ceilings = new Map(CEILINGS.map((n) => [n, empty()]));

let paid = 0;
let searchMs = 0;

for (const gold of GOLD) {
  const { plan, cached, originalUsd } = await planFor(gold.question);
  if (!cached) paid += originalUsd;

  const t0 = Date.now();
  const found = await hybridSearch({
    hypotheticalPassages: plan.hypotheticalPassages,
    keywords: plan.keywords,
    queries: plan.queries,
    mentions: plan.mentions,
    limit: POOL,
  });
  searchMs += Date.now() - t0;

  // `hybridSearch` returns the diversity filter's order, not the score order.
  // The threshold sits before the filter, so the list must go back to the cross-encoder's own.
  const ranked = [...found].sort((a, b) => (b.crossScore ?? 0) - (a.crossScore ?? 0));
  const scores = ranked.map((c) => c.crossScore ?? 0);
  const max = scores[0] ?? 0;

  console.log(`\n${"─".repeat(78)}\n▸ ${gold.question}`);
  const at = (i: number) => (i < scores.length ? scores[i].toFixed(3) : "  –  ");
  console.log(
    `  ${ranked.length} kandidater · poäng  1:${at(0)}  5:${at(4)}  10:${at(9)}  ` +
      `20:${at(19)}  40:${at(39)}  80:${at(79)}  ${ranked.length}:${at(ranked.length - 1)}`,
  );

  // Where the required names sit in the distribution is the whole recall question:
  // a threshold that cuts above the worst of them drops a requirement.
  for (const author of gold.authors ?? []) {
    const i = ranked.findIndex((c) => c.author === author);
    const label = indexedAuthors.has(author) ? "" : " (oindexerad)";
    console.log(
      i < 0
        ? `    ${author}: utanför listan${label}`
        : `    ${author}: plats ${i + 1}, poäng ${scores[i].toFixed(3)} ` +
          `(${((scores[i] / max) * 100).toFixed(0)} % av toppen)`,
    );
  }

  const record = (tally: Tally, o: Outcome) => {
    tally.hits += o.hits;
    tally.required += o.required;
    tally.broke += o.broke ? 1 : 0;
    tally.counts.push(o.n);
  };

  for (const n of CEILINGS) {
    record(ceilings.get(n)!, outcome(gold, ranked, indexedAuthors, n));
  }

  for (const t of SWEEP) {
    record(absolute.get(t)!, outcome(gold, ranked.filter((c) => (c.crossScore ?? 0) >= t), indexedAuthors));
    record(relative.get(t)!, outcome(gold, ranked.filter((c) => (c.crossScore ?? 0) >= t * max), indexedAuthors));
  }
  record(kneeTally, outcome(gold, ranked.slice(0, knee(scores)), indexedAuthors));
}

function row(label: string, t: Tally): string {
  const sorted = [...t.counts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const recall = t.required === 0 ? "–" : `${t.hits}/${t.required}`;
  return (
    `  ${label.padEnd(12)} recall ${recall.padStart(7)}  ` +
    `antal min ${String(sorted[0]).padStart(3)}  median ${String(median).padStart(3)}  ` +
    `max ${String(sorted[sorted.length - 1]).padStart(3)}  ` +
    `brutna spridningskrav ${t.broke}`
  );
}

console.log(`\n${"═".repeat(78)}\n  SAMMANFATTNING — ${GOLD.length} frågor, tak ${CEILING}, pool ${POOL}\n`);
console.log("  bara tak, ingen tröskel");
for (const [n, tally] of ceilings) {
  console.log(row(`  ${n} (${perWorkAt(n)}/${perAuthorAt(n)})`, tally));
}
console.log("\n  absolut  s >= T");
for (const [t, tally] of absolute) console.log(row(`  T=${t}`, tally));
console.log("\n  relativ  s >= α · s_max");
for (const [a, tally] of relative) console.log(row(`  α=${a}`, tally));
console.log("\n  språng");
console.log(row(`  ${KNEE_MIN}–${KNEE_MAX}`, kneeTally));

console.log(
  `\n  hämtning ${(searchMs / GOLD.length / 1000).toFixed(1)} s per fråga vid pool ${POOL} · ` +
    `betalt $${paid.toFixed(4)}\n`,
);
