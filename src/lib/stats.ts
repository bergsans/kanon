/**
 * The stats page's numbers.
 *
 * No new measurement point is added here. The collection's distribution
 * already lives in `works`, every search already writes its cost and its
 * hits into `searches`, and `hits` has counted cache hits ever since
 * `findCached` was written (see `searches.ts`). This module is only a
 * reading of what's already saved — and therefore free, unlike almost
 * everything else in the pipeline.
 */
import { getDb } from "./db";
import type { CostStep } from "./protocol";
import {
  CORPUS_LANGUAGES,
  ERAS,
  GENRES,
  SOURCES,
  type Era,
  type Genre,
  type Language,
  type Source,
} from "./taxonomy";

export interface Count<T extends string> {
  key: T;
  works: number;
}

/**
 * Counts and sorts in the enumeration's order, not the count's — same reason
 * as `sections` on the collection page: a row that changes position when a
 * work is added reads as though something happened. Sources and languages
 * are the exception (see `collectionStats`), since their order already *is*
 * size order.
 */
function tally<T extends string>(values: T[], order: T[]): Count<T>[] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return order
    .filter((key) => counts.has(key))
    .map((key) => ({ key, works: counts.get(key)! }));
}

export interface CollectionStats {
  works: number;
  authors: number;
  byGenre: Count<Genre>[];
  byEra: Count<Era>[];
  /** Descending size — the collection's emphasis, like `bySource` on the collection page. */
  bySource: Count<Source>[];
  byLanguage: Count<Language>[];
}

export const EMPTY_COLLECTION: CollectionStats = {
  works: 0,
  authors: 0,
  byGenre: [],
  byEra: [],
  bySource: [],
  byLanguage: [],
};

export function collectionStats(): CollectionStats {
  try {
    const db = getDb();
    const rows = db
      .prepare("select author, genre, era, source, language from works")
      .all() as {
      author: string;
      genre: Genre;
      era: Era;
      source: Source;
      language: Language;
    }[];
    if (rows.length === 0) return EMPTY_COLLECTION;

    return {
      works: rows.length,
      authors: new Set(rows.map((r) => r.author)).size,
      byGenre: tally(rows.map((r) => r.genre), GENRES),
      byEra: tally(rows.map((r) => r.era), ERAS),
      bySource: tally(rows.map((r) => r.source), SOURCES).sort(
        (a, b) => b.works - a.works,
      ),
      byLanguage: tally(rows.map((r) => r.language), CORPUS_LANGUAGES).sort(
        (a, b) => b.works - a.works,
      ),
    };
  } catch {
    // The database doesn't exist until `pnpm ingest` has run.
    return EMPTY_COLLECTION;
  }
}

export interface UsageStats {
  searches: number;
  /**
   * Of `searches`, how many ran on Claude rather than a local model. Split
   * out so a local search — which always costs exactly nothing — doesn't
   * read as if it were one of the free rides `savedByCache` is actually
   * about, and so `/kostnader` can say which kind of search its dollar
   * figures describe.
   */
  claudeSearches: number;
  /** What the saved searches cost in total, in dollars. */
  spent: number;
  /** Number of times a saved search was reused instead of being rerun. */
  reuses: number;
  /** What those reuses avoided costing — `hits × cost` per row. */
  savedByCache: number;
  projects: number;
  savedPassages: number;
  translations: number;
  translationCost: number;
}

export const EMPTY_USAGE: UsageStats = {
  searches: 0,
  claudeSearches: 0,
  spent: 0,
  reuses: 0,
  savedByCache: 0,
  projects: 0,
  savedPassages: 0,
  translations: 0,
  translationCost: 0,
};

export function usageStats(): UsageStats {
  try {
    const db = getDb();

    const searches = db
      .prepare(
        `select count(*) as searches,
                coalesce(sum(cost), 0) as spent,
                coalesce(sum(hits), 0) as reuses,
                coalesce(sum(hits * cost), 0) as savedByCache,
                coalesce(sum(case when model like 'claude%' then 1 else 0 end), 0) as claudeSearches
           from searches`,
      )
      .get() as {
      searches: number;
      spent: number;
      reuses: number;
      savedByCache: number;
      claudeSearches: number;
    };

    const projects = db
      .prepare(
        `select (select count(*) from projects) as projects,
                (select count(*) from project_passages) as savedPassages`,
      )
      .get() as { projects: number; savedPassages: number };

    const translations = db
      .prepare(
        `select count(*) as translations,
                coalesce(sum(cost), 0) as translationCost
           from translations`,
      )
      .get() as { translations: number; translationCost: number };

    return { ...searches, ...projects, ...translations };
  } catch {
    return EMPTY_USAGE;
  }
}

export interface CostBucket {
  key: string;
  cost: number;
  tokens: number;
}

export interface CostStats {
  byStep: CostBucket[];
  byLine: CostBucket[];
}

export const EMPTY_COST: CostStats = { byStep: [], byLine: [] };

/**
 * A copy of `parseSteps` in `searches.ts`, not a reuse of it. That function
 * is stuck in `searches.ts`, which imports `embed.ts` and loads the
 * embedding model at module start — this file's whole point is being free
 * to read, and such an import would have wrecked that.
 */
function parseSteps(raw: string | null): CostStep[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CostStep[]) : [];
  } catch {
    return [];
  }
}

/**
 * The bill summed across the whole archive instead of one row — the same
 * lines `CostBreakdown` shows for a single question (`step.step`,
 * `line.label`), but added up over every saved search and translation that
 * carried a breakdown. A row from before `cost_detail` existed has no lines
 * and only contributes to `spent` in `usageStats`, never here.
 */
export function costStats(): CostStats {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `select cost_detail from searches where cost_detail != ''
         union all
         select cost_detail from translations where cost_detail != ''`,
      )
      .all() as { cost_detail: string }[];

    const steps = new Map<string, CostBucket>();
    const lines = new Map<string, CostBucket>();
    const add = (
      bucket: Map<string, CostBucket>,
      key: string,
      cost: number,
      tokens: number,
    ) => {
      const entry = bucket.get(key) ?? { key, cost: 0, tokens: 0 };
      entry.cost += cost;
      entry.tokens += tokens;
      bucket.set(key, entry);
    };

    for (const row of rows) {
      for (const step of parseSteps(row.cost_detail)) {
        const stepTokens = step.lines.reduce((sum, l) => sum + l.tokens, 0);
        add(steps, step.step, step.cost, stepTokens);
        for (const line of step.lines) {
          add(lines, line.label, line.cost, line.tokens);
        }
      }
    }

    const bySize = (a: CostBucket, b: CostBucket) => b.cost - a.cost;
    return {
      byStep: [...steps.values()].sort(bySize),
      byLine: [...lines.values()].sort(bySize),
    };
  } catch {
    return EMPTY_COST;
  }
}
