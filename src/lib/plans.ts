/**
 * Saved query expansions — the basis the measurements rest on.
 *
 * `expandQuery` writes four hypothetical passages per question, and it
 * writes new ones every time. That makes retrieval unmeasurable: running
 * `pnpm eval` before and after a change to the branches, the difference
 * between the runs is partly the change and partly four freshly written HyDE
 * passages, and nobody can say which moved what. Pinning the plan to the
 * question makes the number measure what it should.
 *
 * That this is its own module rather than a mode inside `expandQuery` has a
 * direction as its reason: `searches.ts` imports `claude.ts`, so a
 * `normalizePrompt` going the other way would have closed a circle between
 * the two. Here the arrows point outward from both.
 *
 * `.probe-rerank-model.ts` already solved the same problem for itself, by
 * computing the plans once and putting them on disk. This is the same move,
 * but in the database and available to every measurement instead of just one.
 *
 * The app never touches it. Its cache is `searches`, keyed on the whole answer.
 */
import { expandQuery, MODEL, zeroStep, type QueryPlan } from "./claude";
import { getDb } from "./db";
import { normalizePrompt } from "./searches";
import { CORPUS_LANGUAGES } from "./taxonomy";

/** The plan as it sits in the table. The bill is saved in its own column, not in the JSON. */
type StoredPlan = Omit<QueryPlan, "usage">;

/**
 * Does the saved plan carry the shape the code reads today?
 *
 * The table predates the language branches, and rows in it were written when
 * a plan was four English passages and a single `queryEn`. Such a row can
 * still be JSON-parsed without complaint — it becomes a `QueryPlan` where
 * `queries` is `undefined` and the passages are English-only. The damage
 * would therefore not be an error but silence: `pnpm eval` would have
 * measured retrieval with the old branches and reported it as a measurement
 * of the new ones.
 *
 * The check is structural and deliberately not a version stamp. A stamp has
 * to be remembered and bumped by someone; this is the field itself.
 *
 * `inScope` joined the shape later, for the relevance guardrail in
 * `api/search/route.ts` — a plan saved before it exists as a row with the
 * field simply absent, not `false`, and would otherwise silently read back
 * as `undefined` wherever a consumer starts relying on it being a real
 * boolean.
 */
function isCurrentShape(plan: StoredPlan): boolean {
  if (!plan || typeof plan !== "object") return false;
  if (typeof (plan as { inScope?: unknown }).inScope !== "boolean") return false;
  const queries = (plan as { queries?: unknown }).queries;
  if (!queries || typeof queries !== "object") return false;
  return CORPUS_LANGUAGES.every(
    (l) => typeof (queries as Record<string, unknown>)[l] === "string",
  );
}

export interface PlannedQuery {
  plan: QueryPlan;
  /** Did the plan come from the table? Then this run cost nothing. */
  cached: boolean;
  /**
   * What the plan cost the time it was originally computed.
   *
   * Kept apart from `plan.usage` for the same reason `usd` and `originalUsd`
   * are kept apart in `CostPayload`: a cached plan costs zero now and cost
   * something once, and a measurement that prints one figure as the other
   * lies about itself.
   */
  originalUsd: number;
}

/**
 * The plan for a question, from the table if it's there.
 *
 * `refresh` forces a fresh expansion and overwrites the old one — for when
 * the prompt in `EXPAND_SYSTEM` has actually changed and the saved plans are
 * therefore answers to a different question than the one being asked now.
 */
export async function planFor(
  prompt: string,
  opts: { refresh?: boolean } = {},
): Promise<PlannedQuery> {
  const db = getDb();
  // The same normalization as the search cache, not a second one: two
  // questions the app counts as the same question should share a plan here too.
  const key = normalizePrompt(prompt);

  if (!opts.refresh) {
    const row = db
      .prepare(
        "select plan, cost from plans where prompt_norm = ? and model = ?",
      )
      .get(key, MODEL) as { plan: string; cost: number } | undefined;
    if (row) {
      const stored = JSON.parse(row.plan) as StoredPlan;
      // A plan from before the language branches is re-expanded instead of
      // used. That costs something, so it's spoken up about: a measurement
      // that has silently gotten more expensive is better than one that
      // silently measures the wrong thing.
      if (isCurrentShape(stored)) {
        return {
          plan: {
            ...stored,
            // This run paid nothing. The history is in originalUsd.
            usage: zeroStep("frågeexpansion"),
          },
          cached: true,
          originalUsd: row.cost,
        };
      }
      console.warn(
        `[canon] sparad plan för "${prompt.slice(0, 48)}" har en äldre form ` +
          `(saknar frågeformer för samlingens språk, eller fältet "inScope") ` +
          `— expanderas om och skrivs över.`,
      );
    }
  }

  const plan = await expandQuery(prompt);
  const { usage, ...stored } = plan;

  db.prepare(
    `insert into plans (prompt_norm, model, prompt, plan, cost, created_at)
          values (?, ?, ?, ?, ?, ?)
     on conflict(prompt_norm, model) do update set
          prompt = excluded.prompt,
          plan = excluded.plan,
          cost = excluded.cost,
          created_at = excluded.created_at`,
  ).run(
    key,
    MODEL,
    prompt,
    JSON.stringify(stored),
    usage.cost,
    new Date().toISOString(),
  );

  return { plan, cached: false, originalUsd: usage.cost };
}

/**
 * How many plans are saved for the active model — and usable.
 *
 * Only those carrying today's shape count. The number is read as "this many
 * questions cost nothing on the next run," and a row from before the
 * language branches will be re-expanded and cost something; counting it
 * would be promising the wrong thing.
 */
export function countPlans(): number {
  const rows = getDb()
    .prepare("select plan from plans where model = ?")
    .all(MODEL) as { plan: string }[];
  return rows.filter((r) => {
    try {
      return isCurrentShape(JSON.parse(r.plan) as StoredPlan);
    } catch {
      return false;
    }
  }).length;
}

/**
 * Is this particular question saved, in today's shape?
 *
 * `countPlans` answers how many plans exist, not whether the specific
 * questions a measurement intends to ask are among them — and it's that
 * second question that determines what a run costs. Without it, a
 * measurement can only say "this might turn out free." Same shape check as
 * `planFor` makes, for the same reason: a row from before the language
 * branches is re-expanded and costs something, and counting it as cached
 * would be promising the wrong thing.
 */
export function hasPlan(prompt: string): boolean {
  const row = getDb()
    .prepare("select plan from plans where prompt_norm = ? and model = ?")
    .get(normalizePrompt(prompt), MODEL) as { plan: string } | undefined;
  if (!row) return false;
  try {
    return isCurrentShape(JSON.parse(row.plan) as StoredPlan);
  } catch {
    return false;
  }
}

/**
 * Discards the saved plans for the active model.
 *
 * Returns the number of rows that disappeared, so the caller can state what
 * the next run will cost instead of letting the quiet cost arrive as a surprise.
 */
export function forgetPlans(): number {
  return getDb().prepare("delete from plans where model = ?").run(MODEL)
    .changes;
}
