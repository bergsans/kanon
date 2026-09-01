/**
 * Sanity check of retrieval — without reranking and synthesis, so you can
 * see what the search actually hands Claude.
 *
 *   pnpm eval                    run the gold standard (hybrid + local rerank)
 *   pnpm eval --compare          hybrid vs. plain BM25, side by side
 *   pnpm eval --no-rerank        without the cross-encoder, to see what it moves
 *   pnpm eval --no-expand        with and without Claude's query expansion, side by side
 *   pnpm eval --fresh            discard the saved plans and re-expand (costs money)
 *   pnpm eval "custom question"  run a custom question
 *
 * Plans are read from the `plans` table and written there the first time.
 * Two runs in a row therefore give identical output, and the second costs
 * nothing — which is the entire precondition for being able to measure a
 * change in retrieval. See `src/lib/plans.ts`.
 */
import { CANDIDATES } from "../src/lib/claude";
import { countPlans, forgetPlans, planFor } from "../src/lib/plans";
import { scorePairs } from "../src/lib/rerank";
import { hybridSearch, type Candidate } from "../src/lib/search";
import { CORPUS_LANGUAGES, type Language } from "../src/lib/taxonomy";
import { getDb, assertIndexed, type DB } from "../src/lib/db";
import { check, GOLD, type GoldCase } from "./gold";

/**
 * How many candidates retrieval should return.
 *
 * Imported, not copied. The constant used to sit here as its own `20`
 * under the comment "as many as /api/search actually sends", while the
 * route was sending 28 — the eval was therefore measuring a configuration
 * that wasn't running, and nobody could see it on the line.
 */
const RETRIEVE_LIMIT = CANDIDATES;
/** How many get printed — the full list is unreadable in a terminal. */
const SHOW = 12;

/**
 * The free equivalent of `expandQuery` — the baseline in `--no-expand`.
 *
 * Everything Claude produces has a local replacement except one: the
 * three hypothetical passages. Instead of a made-up English answer, the
 * question is embedded as-is, which is exactly what the HyDE step exists
 * to avoid. The keywords become the question's own words, i.e. Swedish —
 * against a collection that's nine-tenths English, that means the BM25
 * branch can reach almost nothing but the Swedish works.
 *
 * `mentions`, on the other hand, can be done locally and exactly: the
 * author list is in the database, so instead of the model guessing a name
 * form, the question's words are matched against the names that are
 * actually indexed. Prefix matching, so "Platon" reaches "Plato" — but
 * "Dostojevskij" doesn't reach "Dostoyevsky", and that's exactly the
 * translation Claude does for free.
 */
function localPlan(db: DB, question: string) {
  const words = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  const authors = (
    db.prepare("select distinct author from works").all() as {
      author: string;
    }[]
  ).map((r) => r.author);
  const mentions = authors.filter((author) =>
    author
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length >= 4)
      .some((token) => words.some((w) => w.startsWith(token))),
  );

  // The question as-is, in every language slot: there's no local
  // translator, and that's exactly the difference `--no-expand` measures.
  // With the language branches, it carries more weight than before —
  // without expansion there's only ONE passage, i.e. a single branch, and
  // it finds only Swedish works.
  return {
    hypotheticalPassages: [question],
    keywords: words,
    queries: Object.fromEntries(
      CORPUS_LANGUAGES.map((l) => [l, question]),
    ) as Record<Language, string>,
    mentions,
  };
}

/**
 * The same judge for both lists.
 *
 * The two modes score against different query text — one against
 * Claude's translated forms, the other against the raw Swedish question —
 * so their own crossScore values can't be compared directly. Here both
 * selections are re-scored against the *same* query pair, so the number
 * measures what it should: how well the passages answer, not which query
 * they were scored against.
 *
 * It's the cross-encoder that judges, not a human, so the number says
 * what that model thinks. Still more than a guess.
 */
async function judge(
  candidates: Candidate[],
  queries: Record<Language, string>,
): Promise<number> {
  const top = candidates.slice(0, SHOW);
  if (top.length === 0) return 0;
  const scores = await scorePairs(
    top.map((c) => ({
      query: queries[c.language] ?? queries.sv,
      passage: c.text,
    })),
  );
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

function render(candidates: Candidate[], limit = SHOW): string {
  if (candidates.length === 0) return "      (inga träffar)";
  const lines = candidates.slice(0, limit).map((c, i) => {
    const where = c.locator ? `, ${c.locator.slice(0, 24)}` : "";
    const src = c.sources.map((s) => s[0]).join("");
    const cross =
      c.crossScore === undefined
        ? "     "
        : c.crossScore.toFixed(2).padStart(5);
    const snippet = c.text.replace(/\s+/g, " ").slice(0, 68);
    return (
      `      ${String(i + 1).padStart(2)}. [${src.padEnd(3)}]${cross} ${c.genre.padEnd(11)} ` +
      `${c.author}${where}\n          ${snippet}…`
    );
  });

  // Spread is the whole point of the broad collection — measure it, don't guess it.
  const genres = new Map<string, number>();
  for (const c of candidates)
    genres.set(c.genre, (genres.get(c.genre) ?? 0) + 1);
  const authors = new Set(candidates.map((c) => c.author)).size;
  const swedish = candidates.filter((c) => c.language === "sv").length;
  lines.push(
    `      … ${candidates.length} kandidater · ${authors} författare · ${swedish} svenska · ` +
      [...genres]
        .sort((a, b) => b[1] - a[1])
        .map(([g, n]) => `${g} ${n}`)
        .join(", "),
  );
  return lines.join("\n");
}

/**
 * The answer key for a question, as two or three lines below the candidate list.
 *
 * A miss is printed as `MISS` and an unindexed author as `oindexerad`,
 * deliberately different words: the first is a bug in retrieval, the
 * second a notice that `pnpm ingest` isn't finished. Printing them the
 * same would make the answer key useless while the collection is being indexed.
 */
function renderGold(gold: GoldCase, r: ReturnType<typeof check>): string {
  const mark = (v: string) =>
    v === "träff" ? "✓" : v === "miss" ? "MISS" : "oindexerad";
  const authors = r.authors
    .map(
      (a) =>
        `${a.required ? "" : "("}${a.author}: ${mark(a.verdict)}${a.required ? "" : ")"}`,
    )
    .join(" · ");

  const lines = [`\n  FACIT  ${authors || "(inga namnkrav)"}`];

  const spread: string[] = [];
  if (r.genresOk !== null) {
    spread.push(
      `genrer ${r.genres}/${gold.minGenres} ${r.genresOk ? "✓" : "MISS"}`,
    );
  }
  if (r.swedishOk !== null) {
    spread.push(
      `svenska stycken ${r.swedish}/${gold.minSwedish} ${r.swedishOk ? "✓" : "MISS"}`,
    );
  }
  if (spread.length > 0) lines.push(`         ${spread.join(" · ")}`);

  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const compare = args.includes("--compare");
  const disableRerank = args.includes("--no-rerank");
  const noExpand = args.includes("--no-expand");
  const fresh = args.includes("--fresh");
  const custom = args.filter((a) => !a.startsWith("--"));
  const cases: (GoldCase | { question: string })[] =
    custom.length > 0 ? custom.map((question) => ({ question })) : GOLD;

  const db = getDb();
  assertIndexed(db);

  // The answer key distinguishes "didn't make the cut" from "isn't in the
  // database", and therefore needs to know what's actually indexed right
  // now — not what the manifest promises.
  const indexedAuthors = new Set(
    (
      db.prepare("select distinct author from works").all() as {
        author: string;
      }[]
    ).map((r) => r.author),
  );

  if (fresh) {
    const gone = forgetPlans();
    console.log(
      `  ${gone} sparade planer kastade — de expanderas om, och det kostar.`,
    );
  }
  console.log(
    `  ${countPlans()} planer i cachen · ${indexedAuthors.size} indexerade författare`,
  );

  // Summed across all questions: any single question can swing either way.
  const totals = { withExpand: 0, without: 0, overlap: 0, questions: 0 };
  const score = {
    hits: 0,
    required: 0,
    untestable: 0,
    spread: 0,
    spreadOf: 0,
    paid: 0,
  };

  for (const probe of cases) {
    const { question } = probe;
    const gold =
      "authors" in probe || "probes" in probe ? (probe as GoldCase) : null;

    console.log(`\n${"─".repeat(72)}\n▸ ${question}`);

    const { plan, cached, originalUsd } = await planFor(question);
    if (!cached) score.paid += originalUsd;
    console.log(`  ${plan.restatement}`);
    console.log(`  engelsk form: ${plan.queries.en}`);
    if (plan.mentions.length > 0)
      console.log(`  nämner: ${plan.mentions.join(", ")}`);
    console.log(`  sökord: ${plan.keywords.slice(0, 10).join(", ")}\n`);

    const hybrid = await hybridSearch({
      hypotheticalPassages: plan.hypotheticalPassages,
      keywords: plan.keywords,
      queries: plan.queries,
      mentions: plan.mentions,
      limit: RETRIEVE_LIMIT,
      disableRerank,
    });
    console.log(
      disableRerank
        ? "  HYBRID (vektor + BM25)"
        : "  HYBRID + LOKAL OMRANKNING",
    );
    console.log(render(hybrid));

    if (gold) {
      const result = check(gold, hybrid, indexedAuthors);
      console.log(renderGold(gold, result));
      score.hits += result.hits;
      score.required += result.required;
      score.untestable += result.untestable;
      for (const ok of [result.genresOk, result.swedishOk]) {
        if (ok === null) continue;
        score.spreadOf++;
        if (ok) score.spread++;
      }
    }

    if (noExpand) {
      const local = localPlan(db, question);
      console.log(
        `\n  UTAN EXPANSION (frågan som den står, inga Claude-anrop)`,
      );
      if (local.mentions.length > 0)
        console.log(`  lokalt matchade namn: ${local.mentions.join(", ")}`);
      const bare = await hybridSearch({
        ...local,
        limit: RETRIEVE_LIMIT,
        disableRerank,
      });
      console.log(render(bare));

      // The same judge on both selections, and the overlap in the top twelve.
      const queries = plan.queries;
      const [scoreWith, scoreWithout] = await Promise.all([
        judge(hybrid, queries),
        judge(bare, queries),
      ]);
      const topWith = new Set(hybrid.slice(0, SHOW).map((c) => c.chunkId));
      const shared = bare
        .slice(0, SHOW)
        .filter((c) => topWith.has(c.chunkId)).length;

      console.log(
        `\n  domare (medelpoäng topp ${SHOW}): med expansion ${scoreWith.toFixed(3)} · ` +
          `utan ${scoreWithout.toFixed(3)} · överlapp ${shared}/${SHOW}`,
      );
      totals.withExpand += scoreWith;
      totals.without += scoreWithout;
      totals.overlap += shared;
      totals.questions++;
    }

    if (compare) {
      const lexical = await hybridSearch({
        hypotheticalPassages: plan.hypotheticalPassages,
        keywords: plan.keywords,
        limit: RETRIEVE_LIMIT,
        disableVector: true,
        disableRerank: true,
      });
      console.log("\n  ENDAST BM25");
      console.log(render(lexical));

      const hybridWorks = new Set(hybrid.map((c) => c.workId));
      const lexicalWorks = new Set(lexical.map((c) => c.workId));
      const onlyHybrid = [...hybridWorks].filter((w) => !lexicalWorks.has(w));
      if (onlyHybrid.length > 0) {
        console.log(`\n  Bara vektorgrenen hittade: ${onlyHybrid.join(", ")}`);
      }
    }
  }

  console.log(`\n${"═".repeat(72)}`);

  if (score.required > 0 || score.untestable > 0) {
    // Recall is only counted on what could actually be tested. If the
    // unindexed authors sat in the denominator, the number would climb on
    // its own as ingest caught up, and look as if a change in retrieval had helped.
    const pct = score.required > 0 ? (100 * score.hits) / score.required : 0;
    console.log(
      `  recall@${RETRIEVE_LIMIT}  ${score.hits}/${score.required} (${pct.toFixed(0)} %)` +
        (score.untestable > 0
          ? `  ·  ${score.untestable} krav kunde inte prövas, författaren är inte indexerad`
          : ""),
    );
    if (score.spreadOf > 0) {
      console.log(
        `  spridning   ${score.spread}/${score.spreadOf} krav uppfyllda`,
      );
    }
  }

  if (totals.questions > 0) {
    const n = totals.questions;
    console.log(
      `  ${n} frågor · medelpoäng med expansion ` +
        `${(totals.withExpand / n).toFixed(3)} · utan ${(totals.without / n).toFixed(3)} · ` +
        `överlapp i snitt ${(totals.overlap / n).toFixed(1)}/${SHOW}`,
    );
  }

  // Zero when every plan came from the table. Printing it is the whole
  // point of the cache: a measurement that costs nothing can be rerun until it's certain.
  console.log(`  körningen kostade  $${score.paid.toFixed(4)}`);
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
