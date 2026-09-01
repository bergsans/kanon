import fs from "node:fs";
import path from "node:path";
import {
  assertIndexed,
  getDb,
  PASSAGE_COLUMNS,
  TEXTS_DIR,
  vecBlob,
  vecKey,
  type DB,
  type PassageRow,
} from "./db";
import { embedQuery } from "./embed";
import type { ContextWindowPayload } from "./protocol";
import { ENABLED as RERANK_ENABLED, scorePairs } from "./rerank";
// From taxonomy, not from corpus: the latter pulls in the manifest, and these
// are values, not types — so the import wouldn't have vanished in the build.
import { isFiltered, NO_FILTER, type CorpusFilter } from "./taxonomy";
import type { Language, Source } from "./corpus";

/**
 * How many candidates each branch contributes before fusion. Raised from 60 when
 * the collection grew 20×: the top list is now drawn from a much larger pool.
 *
 * This used to say the KNN would cost ~20 ms, and that no longer holds. At 852,410
 * vectors, k=100 was clocked at 0.3–0.7 s per branch (`.probe-genre-filter2.ts`), so
 * the vector branches are seconds of retrieval's twelve, not milliseconds. They are
 * also nine now that the language branches exist, not four — that's the single
 * largest item in retrieval latency, and the price for the collection's
 * non-English fifth being findable at all.
 *
 * The number still stands where it stands, because the measurement shows the cost
 * lies in the scan, not the slots: k=400 cost 521 ms and k=4096 cost 971 ms in the
 * same run. Trimming k saves almost nothing.
 *
 * The millisecond figures are ceilings, not fixed values. The machine was running
 * two ingests at once, and the collection grew during measurement — it's the
 * relationship between the numbers that carries meaning, not the numbers themselves.
 */
const BRANCH_LIMIT = 100;
/** RRF constant. 60 is the default from the original paper. */
const RRF_K = 60;

export interface Candidate extends PassageRow {
  charStart: number;
  charEnd: number;
  /** Fusion score — only meaningful for ordering within a single result set. */
  score: number;
  /**
   * The cross-encoder's score, 0–1. Missing when local reranking is disabled
   * or failed to load; the list then stays in fusion order.
   */
  crossScore?: number;
  /** Which branches found the passage. Useful for debugging in eval. */
  sources: BranchName[];
}

/**
 * What `hybridSearch` returns — still a plain `Candidate[]` to every existing
 * caller (eval scripts, probes), with one extra flag attached to the array
 * itself rather than changing the shape everyone destructures.
 *
 * `degraded` is true when the cross-encoder fell back to fusion order (the
 * model failed to load). The route uses it to skip `saveSearch`: without
 * this, a search that ran while the model was downloading got cached and
 * served as the permanent answer to that question.
 */
export type CandidateList = Candidate[] & { degraded?: boolean };

export interface SearchOptions {
  /**
   * Hypothetical passages (HyDE) to embed — one per branch.
   *
   * Several instead of one, for two reasons that sit on different axes.
   *
   * REGISTER: a passage written in the treatise's register lands among the
   * treatises. Writing the same answer once as historical narrative, once as
   * dramatic dialogue, and once as speculative system-building makes the branches
   * hit different parts of the collection, and the fusion below weighs them
   * together.
   *
   * LANGUAGE: the embedding model splits the vector space by language before
   * content, so a branch only finds texts in the language its passage is written
   * in. Measured in `.probe-lang-branch.ts` — the same idea in four languages gave
   * 99/100 English, 100/100 French, 98/100 German, and 100/100 Swedish neighbors.
   * A language without a passage is therefore a language without hits, no matter
   * how well its works would answer.
   *
   * The list is thus four English registers plus one passage per other language in
   * the collection — nine in this app's case. This module doesn't need to know
   * which passage is which: the vector carries the language.
   *
   * The embedding runs locally, so the branches only cost time. Nine KNNs instead
   * of four is ~1.5–3.5 s more on the unfiltered path (0.3–0.7 s per branch, see
   * `BRANCH_LIMIT`) out of a retrieval of around twelve seconds.
   */
  hypotheticalPassages: string[];
  /**
   * Keywords for the BM25 branch, in the collection's languages. All go into the
   * same FTS query: the branch is one of eleven, and it's the vector branches that
   * carry the language work.
   */
  keywords: string[];
  /**
   * The query in each of the collection's languages, for the local reranker. Each
   * passage is scored against the query in its own language. Without this, the
   * cross-encoder is skipped and the list stays in fusion order.
   *
   * That the languages can even be compared within a single ranking is measured,
   * in `.probe-lang-crossscore.ts`: the same content in the collection's six
   * languages landed at average rank 2.7–5.3 of 18 when sorted together, and the
   * model separated answering from non-answering passages in all six (0.33–0.60
   * score difference). So no language quota is needed here — worth measuring,
   * because a systematic skew would have silently made the language branches above
   * pointless.
   */
  queries?: Record<Language, string>;
  /**
   * Authors and works the query explicitly names. "What does Kant say about
   * lying?" has no guarantee of returning Kant without this — HyDE and the vector
   * space don't care who wrote the passage.
   */
  mentions?: string[];
  /**
   * Genres and eras the search is restricted to. Omitted or empty = the whole
   * collection, and then exactly the same queries run as before the filter
   * existed — the unfiltered search shouldn't pay anything for the filtered one
   * being possible.
   */
  filter?: CorpusFilter;
  limit?: number;
  /** Disable the vector branch — used by eval to compare against plain BM25. */
  disableVector?: boolean;
  /** Disable the cross-encoder — used by eval to measure what it contributes. */
  disableRerank?: boolean;
}

/**
 * How many passages from the same work, and from the same author, get a slot in
 * the candidate list — as a SHARE of the list's length, not as fixed numbers.
 *
 * Without a cap, a question like "civilization versus barbarism" gets answered by
 * fifteen passages from Gibbon's *Decline and Fall*, because that's six volumes
 * that all sit close to the query in vector space. Reranking can only choose
 * among what it's shown, so the spread has to happen here — not there.
 *
 * The shares are today's numbers, 3 and 4, divided by today's 28. The reason they
 * are shares and not fixed counts is that fixed counts silently tighten every time
 * the candidate list grows: 3 of 28 is every ninth passage, 3 of 64 is every
 * twenty-first, and a widening that simultaneously halves how many votes a work
 * gets to contribute is two changes under one name.
 *
 * That the caps don't cost diversity is measured: `.probe-cross-threshold.ts` ran
 * the gold standard's twelve queries at 28 (3/4), 48 (5/7), 64 (7/9) and 96 (10/14)
 * and NONE of them broke a single one of the answer key's diversity requirements —
 * `minGenres`, `minSwedish`. Recall, however, rose at every step: 7/19, 11/19,
 * 13/19, 15/19.
 *
 * Passages crowded out are not discarded: they are saved and used to top up from
 * the end if the list would otherwise end up shorter than `limit`. See `fill` in
 * `diversify`.
 */
const WORK_SHARE = 3 / 28;
const AUTHOR_SHARE = 4 / 28;

/**
 * The floor of 3 and 4 exists for callers with short lists. `similarChunks` asks
 * for six neighbors, and a share of six would give a cap of 1 — which is right
 * there, but for a different reason, so it passes its own caps instead.
 */
const maxPerWork = (limit: number) =>
  Math.max(3, Math.round(limit * WORK_SHARE));
const maxPerAuthor = (limit: number) =>
  Math.max(4, Math.round(limit * AUTHOR_SHARE));

/**
 * How many terms the FTS query includes.
 *
 * Raised from 24 when the keywords became six-language. Twenty-four was enough as
 * long as they were English, but with 3–5 words per language beyond English the
 * list runs to around seventy, and a cap at 24 would have kept the English and
 * maybe the French and silently dropped the rest — exactly the bug the language
 * branches exist to fix, one branch further down. The terms are not sorted, so the
 * cap cuts in the order the model wrote them.
 */
const FTS_TERM_LIMIT = 96;

/**
 * FTS5 has its own query syntax where characters like " * ( ) : ^ - NEAR OR AND
 * are operators. The user's (and Claude's) words must be quoted, otherwise an
 * apostrophe or a hyphen becomes a syntax error in the middle of a search.
 *
 * Accents and umlauts are left untouched: the unicode61 tokenizer folds them
 * itself, so "liberté" and "Freiheit" match their printed forms.
 */
function toFtsQuery(keywords: string[]): string {
  const terms = keywords
    .flatMap((k) => k.split(/\s+/))
    .map((t) => t.replace(/["*()^:-]/g, "").trim())
    .filter((t) => t.length > 2)
    .slice(0, FTS_TERM_LIMIT);
  if (terms.length === 0) return "";
  return [...new Set(terms)].map((t) => `"${t}"`).join(" OR ");
}

type BranchName = "vector" | "keyword" | "mention";

interface Ranked {
  chunkId: number;
  rank: number;
}

function vectorBranch(db: DB, embedding: Float32Array): Ranked[] {
  // No is_front_matter filtering needed — front matter is never embedded, so
  // vec_chunks contains only body text.
  const rows = db
    .prepare(
      `select chunk_id as chunkId
         from vec_chunks
        where embedding match ? and k = ?
        order by distance`,
    )
    .all(vecBlob(embedding), BRANCH_LIMIT) as { chunkId: number }[];
  return rows.map((r, i) => ({ chunkId: r.chunkId, rank: i }));
}

function keywordBranch(
  db: DB,
  ftsQuery: string,
  filter: CorpusFilter,
): Ranked[] {
  if (!ftsQuery) return [];
  const where = filterSql(filter);
  try {
    // The join against works is now unconditional, not just when something's
    // selected — `chunk_count > 0` needs it regardless of a genre/era filter.
    // Without it, a work mid-ingest or aborted partway (chunks and FTS rows
    // committed, embeddings still to come — see `ingestWork` in ingest.ts)
    // showed up in keyword results with no vector branch ever finding it,
    // an inconsistency between how the same passage can and can't be reached.
    const rows = db
      .prepare(
        `select c.id as chunkId
           from chunks_fts f
           join chunks c on c.id = f.rowid
           join works w on w.id = c.work_id
          where chunks_fts match ? and c.is_front_matter = 0 and w.chunk_count > 0 ${where.sql}
          order by bm25(chunks_fts)
          limit ?`,
      )
      .all(ftsQuery, ...where.params, BRANCH_LIMIT) as { chunkId: number }[];
    return rows.map((r, i) => ({ chunkId: r.chunkId, rank: i }));
  } catch (err) {
    // Better to fall back to vector-only hits than a crashed response if the query
    // ended up invalid anyway. Logged, unlike before, so a malformed FTS query
    // shows up somewhere instead of silently thinning the candidate pool.
    console.warn("[canon] BM25-sökning misslyckades, faller tillbaka på vektorträffar:", err);
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Genre and era filter
 * ------------------------------------------------------------------ */

/**
 * The filter as a condition to attach to a query against `works`.
 *
 * The two axes are built in one place and not per branch: a branch that filtered
 * on genre but forgot the era wouldn't give a half filter but a bug — a candidate
 * list where half the branches answered a different question than the others.
 */
function filterSql(
  filter: CorpusFilter,
  alias = "w",
): { sql: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filter.genres.length) {
    clauses.push(
      `and ${alias}.genre in (${filter.genres.map(() => "?").join(",")})`,
    );
    params.push(...filter.genres);
  }
  if (filter.eras.length) {
    clauses.push(
      `and ${alias}.era in (${filter.eras.map(() => "?").join(",")})`,
    );
    params.push(...filter.eras);
  }
  return { sql: clauses.join(" "), params };
}

/**
 * The share of the collection below which an oversampled KNN stops filling its
 * slots.
 *
 * MEASURED, in `.probe-genre-filter.ts`. vec0's KNN cannot take a genre condition
 * — it searches the whole index — so a genre filter has only two routes: sift out
 * of a KNN with a high k, or compute the distances directly against the genre's
 * passages.
 *
 * Sifting gives an *exactly* correct answer as long as it fills its hundred slots:
 * a global KNN comes back in distance order, so what's sifted out of it is the
 * genre's true top hundred. What's missing when the list comes up short lies, by
 * definition, outside the k nearest of the whole collection. The fill rate is thus
 * the entire measure, and it was measured per genre at k=4096, vec0's ceiling,
 * with one passage per register, when the collection held 852,410 body-text
 * passages:
 *
 *   philosophy 24.7%  100 100 100 100      essay        5.3%  100 100 100 100
 *   prose      18.8%  100 100 100 100      science      4.3%  100 100 100  49
 *   history    17.7%  100 100 100 100      anthropology 3.5%  100 100  82  68
 *   poetry     10.7%   97 100 100 100      religion     2.7%    4  53  56  33
 *   politics    6.7%  100 100 100 100      drama        5.7%   73  74 100 100
 *
 * The threshold is set at seven percent and not at drama: a genre can fall out of
 * a KNN because the query points away from it, not because the genre is small, and
 * drama at 5.7% misses where essay at 5.3% doesn't. The number is also roughly
 * where the costs cross — the exact scan costs ~69 µs per passage (see below), so
 * ~4 s at seven percent, against ~3.9 s for four oversampled KNNs.
 *
 * The shares are passages, not works, and they shift as the collection grows. It's
 * the fill rate against the share that's the measurement; the percentages in the
 * table are where the genres stood that day.
 */
const OVERSAMPLE_SHARE = 0.07;

/**
 * The steps the oversampled KNN is tried at.
 *
 * 4096 is vec0's ceiling: a larger k is rejected with "k value in knn query too
 * large". 400 comes first because it's enough for the three big genres and costs
 * 521 ms against 971 — four branches save 1.8 s on the most common search. If the
 * list still comes up short, the next step is tried; if it's still short at the
 * ceiling, the branch is left shorter than a hundred. Falling back to an exact
 * scan there would mean paying four seconds for the three slots poetry was
 * missing, and RRF weighs by rank and tolerates a short branch.
 */
const OVERSAMPLE_K = [400, 4096];

/** SQLite accepts ~32,000 bound parameters; keep margin and batch. */
const ID_BATCH = 5000;

/**
 * The size of the selection — the number that decides which of the two techniques
 * is used.
 *
 * Counted in passages, not works. One genre can consist of twenty thick volumes
 * and another of two hundred slim poetry chapbooks, and it's the passages a KNN
 * searches through.
 *
 * The sum is taken from `works.chunk_count`, not from `chunks`. It's the same
 * number counted over two thousand rows instead of a million, and the difference
 * is worth the whole decision: `count(*)` with a join against works was clocked at
 * 2.1 s (`.probe-filter-cost.ts`), i.e. more than the four vector branches it was
 * supposed to pick a technique for.
 *
 * `chunk_count` includes the front matter, which is never embedded — 1,051,472
 * against 969,858 passages, a three percent overestimate spread evenly across the
 * collection. The number is only used as a share against a threshold with margin,
 * and that skew doesn't move any boundary.
 */
function selectionShare(
  db: DB,
  filter: CorpusFilter,
): { chunks: number; share: number } {
  const where = filterSql(filter, "works");
  const { selected, total } = db
    .prepare(
      // `1 = 1` is there because the conditions are written with their own "and"
      // — the same fragment should hang off any query without anyone having to
      // work out whether it needs a "where" or an "and" before it.
      `select sum(case when 1 = 1 ${where.sql} then chunk_count else 0 end) as selected,
              sum(chunk_count) as total
         from works`,
    )
    .get(...where.params) as { selected: number | null; total: number | null };
  return {
    chunks: selected ?? 0,
    share: total ? (selected ?? 0) / total : 0,
  };
}

/** KNN over the whole index, then sifted by the filter. Exact as long as the list fills up. */
function oversampledBranch(
  db: DB,
  embedding: Float32Array,
  filter: CorpusFilter,
): Ranked[] {
  const blob = vecBlob(embedding);
  const where = filterSql(filter);
  const stmt = db.prepare(
    `with knn as (
       select chunk_id, distance from vec_chunks where embedding match ? and k = ?
     )
     select knn.chunk_id as chunkId from knn
       join chunks c on c.id = knn.chunk_id
       join works w on w.id = c.work_id
      where c.is_front_matter = 0 ${where.sql}
      order by knn.distance
      limit ?`,
  );
  let rows: { chunkId: number }[] = [];
  for (const k of OVERSAMPLE_K) {
    rows = stmt.all(blob, k, ...where.params, BRANCH_LIMIT) as {
      chunkId: number;
    }[];
    if (rows.length >= BRANCH_LIMIT) break;
  }
  return rows.map((r, i) => ({ chunkId: r.chunkId, rank: i }));
}

/**
 * Distances computed directly against a set of passages, bypassing vec0's KNN.
 *
 * The exact route for everything the global index can't answer: a small
 * selection, a named author's works, a single work. Returns one top-`k` list
 * per embedding (`"each"`), or a single list ranked by each passage's smallest
 * distance to any of them (`"min"`).
 *
 * Every embedding is a column in the *same* scan, and that sharing is what
 * makes the route possible. The cost lies in row fetching and blob decoding,
 * not in the 384 multiplications: four separate queries against drama's 48,683
 * passages took 9.7 s; one scan computing all four distances took 3.4 s — 69 µs
 * per passage instead of 198. The ratio is the measurement; the second counts
 * were clocked on a machine simultaneously running two ingests and are
 * therefore ceilings. That they give the *same* answer is no approximation:
 * all four top lists were identical to the four queries' own, 100 of 100
 * (`.probe-genre-filter3.ts`).
 *
 * One function for the three callers that used to carry a copy each — the
 * batching and the per-batch trim are the parts that go quietly wrong, and
 * they should go wrong or right in one place.
 */
function scanNearest(
  db: DB,
  ids: number[],
  embeddings: Float32Array[],
  k: number,
  combine: "each" | "min",
): number[][] {
  const blobs = embeddings.map(vecBlob);
  const columns = embeddings
    .map((_, i) => `vec_distance_cosine(embedding, ?) as d${i}`)
    .join(", ");
  const tops: { chunkId: number; d: number }[][] = Array.from(
    { length: combine === "each" ? embeddings.length : 1 },
    () => [],
  );

  // Batched even though SQLite's ~32,000 parameters is rarely close: hitting it
  // wouldn't show up as an error but as a search that silently dropped half its
  // selection.
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const slice = ids.slice(i, i + ID_BATCH);
    const rows = db
      .prepare(
        `select chunk_id as chunkId, ${columns}
           from vec_chunks where chunk_id in (${slice.map(() => "?").join(",")})`,
      )
      .all(...blobs, ...slice) as Record<string, number>[];
    for (const row of rows) {
      if (combine === "min") {
        let best = Infinity;
        for (let b = 0; b < embeddings.length; b++)
          best = Math.min(best, row[`d${b}`]);
        tops[0].push({ chunkId: row.chunkId, d: best });
      } else {
        for (let b = 0; b < embeddings.length; b++)
          tops[b].push({ chunkId: row.chunkId, d: row[`d${b}`] });
      }
    }
    // Trim per batch: otherwise a whole genre's distances sit in memory at once.
    for (const top of tops) {
      top.sort((a, b) => a.d - b.d);
      top.length = Math.min(top.length, k);
    }
  }
  return tops.map((top) => top.map((r) => r.chunkId));
}

function toRanked(ids: number[]): Ranked[] {
  return ids.map((chunkId, rank) => ({ chunkId, rank }));
}

/** The exact route for a selection below `OVERSAMPLE_SHARE`, one list per passage. */
function exactBranches(
  db: DB,
  embeddings: Float32Array[],
  filter: CorpusFilter,
): Ranked[][] {
  // Works first, then passages. Otherwise the query planner reads through the
  // whole chunks table and looks up the work for every row — a million lookups for
  // thirty thousand passages. Medieval-era passages: 0.9 s with the join, 0.03 s
  // with the two queries here, and the same 33,113 rows from both.
  const where = filterSql(filter, "works");
  const workIds = (
    db
      .prepare(`select id from works where 1 = 1 ${where.sql}`)
      .all(...where.params) as {
      id: string;
    }[]
  ).map((r) => r.id);
  if (workIds.length === 0) return embeddings.map(() => []);

  const ids: number[] = [];
  for (let i = 0; i < workIds.length; i += ID_BATCH) {
    const slice = workIds.slice(i, i + ID_BATCH);
    const rows = db
      .prepare(
        `select id from chunks
          where work_id in (${slice.map(() => "?").join(",")}) and is_front_matter = 0`,
      )
      .all(...slice) as { id: number }[];
    // A plain loop, not `ids.push(...rows.map(...))` — V8's argument-spread
    // limit sits around 120k, and an unfiltered scan can already return tens
    // of thousands of rows per batch as the collection grows, which would
    // throw `RangeError: Maximum call stack size exceeded` here.
    for (const r of rows) ids.push(r.id);
  }
  if (ids.length === 0) return embeddings.map(() => []);

  return scanNearest(db, ids, embeddings, BRANCH_LIMIT, "each").map(toRanked);
}

/** The vector branches when a selection is active — one per hypothetical passage. */
function filteredVectorBranches(
  db: DB,
  embeddings: Float32Array[],
  filter: CorpusFilter,
): Ranked[][] {
  if (embeddings.length === 0) return [];
  const selection = selectionShare(db, filter);
  if (selection.chunks === 0) return embeddings.map(() => []);
  return selection.share >= OVERSAMPLE_SHARE
    ? embeddings.map((e) => oversampledBranch(db, e, filter))
    : exactBranches(db, embeddings, filter);
}

/**
 * Vector search restricted to the works the query actually names.
 *
 * "What does Kant say about lying?" used to go through HyDE like any other query,
 * and the vector space doesn't care who wrote a passage: the answer could come
 * back Mill, Sidgwick, and Augustine — reasonable passages about lying, but not
 * what was asked for.
 *
 * This branch can't use vec0's own KNN, which searches the whole index. Instead
 * the distance is computed directly against the passages in question. That sounds
 * expensive and isn't: Plato's 5,700 passages take 57 ms, and he's the collection's
 * most prolific author.
 */
const MENTION_WORK_LIMIT = 40;

function mentionBranch(
  db: DB,
  mentions: string[],
  embeddings: Float32Array[],
  filter: CorpusFilter,
): Ranked[] {
  // The filter applies to this branch too. A query that names Kant while searching
  // poetry shouldn't get Kant's treatises back through a side door — someone who
  // chose a genre or era has said something about what kind of answer is wanted,
  // not just about whom. The alias is the table itself: there's no join here to
  // hang a `w` on.
  const where = filterSql(filter, "works");
  const findWorks = db.prepare(
    `select id from works
      where (author like ? escape '\\' or title like ? escape '\\') ${where.sql}
      limit ?`,
  );

  const workIds = new Set<string>();
  for (const mention of mentions) {
    const term = mention.trim();
    // Shorter than this it's not an author name but a word: "On", "Is", initials.
    if (term.length < 4) continue;
    const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    for (const row of findWorks.all(
      like,
      like,
      ...where.params,
      MENTION_WORK_LIMIT,
    ) as {
      id: string;
    }[]) {
      workIds.add(row.id);
    }
    if (workIds.size >= MENTION_WORK_LIMIT) break;
  }
  if (workIds.size === 0) return [];

  const ids = db
    .prepare(
      `select id from chunks
        where work_id in (${[...workIds].map(() => "?").join(",")}) and is_front_matter = 0`,
    )
    .all(...workIds) as { id: number }[];
  if (ids.length === 0) return [];

  // The MINIMUM distance to any of the passages, not the distance to the first
  // one.
  //
  // This branch used to measure against `embeddings[0]`, the treatise passage,
  // which is English. That worked as long as every passage was English. Now the
  // list carries one passage per language, and a query naming Strindberg or Kant
  // wants to hit their works in the original — against an English vector, the
  // whole Swedish work sits far away (`.probe-lang-branch.ts`), and the ranking
  // within the work is all that carries. Taking the minimum automatically picks
  // the language garb closest to the passage.
  //
  // The cost is unchanged: all the distances are computed in the same scan — see
  // `scanNearest`.
  return toRanked(
    scanNearest(
      db,
      ids.map((r) => r.id),
      embeddings,
      BRANCH_LIMIT,
      "min",
    )[0],
  );
}

/**
 * Reciprocal Rank Fusion. Vector distance and BM25 score live on entirely
 * different scales, so we weigh by rank instead of by score — that way we avoid
 * normalizing.
 */
function fuse(branches: { name: BranchName; ranked: Ranked[] }[]) {
  const acc = new Map<number, { score: number; sources: BranchName[] }>();
  for (const { name, ranked } of branches) {
    for (const { chunkId, rank } of ranked) {
      const cur = acc.get(chunkId) ?? { score: 0, sources: [] };
      cur.score += 1 / (RRF_K + rank + 1);
      // Three vector branches shouldn't show up as three different sources on the
      // passage card.
      if (!cur.sources.includes(name)) cur.sources.push(name);
      acc.set(chunkId, cur);
    }
  }
  return [...acc.entries()].sort((a, b) => b[1].score - a[1].score);
}

/**
 * How many candidates the cross-encoder gets to read. It costs ~70 ms per
 * passage, so this number trades off latency against how deep into the fusion
 * list a good passage is allowed to come from.
 *
 * Raised from 48, and the reason isn't what raised it. Measured on a real run of
 * "does history make progress" (`.probe-progress-hegel.ts`): 13 of the 28
 * candidates that went on to Claude came from fusion rank 49–96, and the three the
 * cross-encoder ranked highest of all sat at rank 63, 67, and 68. At 48, the
 * answer's best passage would never have been read. Fusion order and
 * cross-encoder order thus have almost nothing to do with each other — which is
 * the whole reason this step exists, and therefore the wrong place to economize.
 *
 * The price is latency and nothing else: the whole retrieval was clocked at 11.9 s
 * in that run, against the ~70 ms per pair `rerank.ts` measured.
 *
 * The raise was originally made to rescue Hegel from that very question, and it
 * didn't. The Hegel passages sitting inside the pool — fusion rank 46, 61, 83, 86
 * — are the aesthetics, and the cross-encoder rightly scores them 0.007 against
 * Tylor's 0.685. The passage that answers (§ 548, Weltgeschichte) never enters the
 * fusion at all, regardless of pool size. See `hypotheticalPassages` in claude.ts.
 *
 * Raised 96 → 192 alongside `CANDIDATES` 28 → 64, and the reason is the same as
 * last time: the pool must be several times the candidate list, because fusion
 * order and cross-encoder order have almost nothing to do with each other. A pool
 * of 96 meant to yield 64 candidates would in practice be no reranking at all —
 * two of every three read passages go through regardless.
 *
 * The price is measured and it's small: 12.2 s per query at pool 192 against the
 * 11.9 s `.probe-progress-hegel.ts` clocked at 96, averaged over the gold
 * standard's twelve queries in `.probe-cross-threshold.ts`. Doubling the pool thus
 * cost ~0.3 s, not the ~7 s a linear count at 70 ms per pair would have predicted
 * — the batching in `rerank.ts` carries the other half almost for free.
 */
/**
 * `Number("")` is `0`, not `NaN` — an env var set but left empty would
 * otherwise silently collapse the candidate pool instead of falling back to
 * the measured default. Same guard as `usdSek()` in `money.ts`. Exported so
 * `EXTERNAL_MAX_USES` in claude.ts reads the same parser instead of a
 * second copy of this guard.
 */
export function envInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const RERANK_POOL = envInt(process.env.CANON_RERANK_POOL, 192);

/**
 * Scores the candidates with the cross-encoder and reranks them.
 *
 * Falls back to fusion order if the model failed to load — the first run
 * downloads ~470 MB, and someone searching while that's in progress should get a
 * worse answer, not an error.
 */
async function crossRerank(
  candidates: Candidate[],
  queries: Record<Language, string>,
): Promise<{ ranked: Candidate[]; degraded: boolean }> {
  try {
    const scores = await scorePairs(
      // The query in the passage's own language. Used to read "Swedish if the
      // passage is Swedish, else English," which scored every German, French,
      // Italian, and Latin passage against an English query. That wasn't what made
      // them invisible — they never reached this point — but it would have become
      // the next bottleneck as soon as the language branches let them through. If
      // the query form is missing, the Swedish one is used: `expandQuery` always
      // fills in all six.
      candidates.map((c) => ({
        query: queries[c.language] ?? queries.sv,
        passage: c.text,
      })),
    );
    return {
      ranked: candidates
        .map((c, i) => ({ ...c, crossScore: scores[i] }))
        .sort((a, b) => b.crossScore - a.crossScore),
      degraded: false,
    };
  } catch (err) {
    console.warn("[canon] lokal omrankning hoppades över:", err);
    return { ranked: candidates, degraded: true };
  }
}

export async function hybridSearch(opts: SearchOptions): Promise<CandidateList> {
  const db = getDb();
  assertIndexed(db);
  const limit = opts.limit ?? 24;
  const queries = opts.queries;
  const rerank = RERANK_ENABLED && !opts.disableRerank && queries !== undefined;

  // The filter applies to every branch and nothing after them. A selection that
  // only sifted the fusion list would have given an empty search for the narrow
  // genres: religion is 2.7% of the collection, and its best passages rarely reach
  // the first hundred.
  const filter = opts.filter ?? NO_FILTER;
  const filtered = isFiltered(filter);

  const branches: { name: BranchName; ranked: Ranked[] }[] = [];
  const embeddings: Float32Array[] = [];

  if (!opts.disableVector) {
    // HyDE: we embed a hypothetical *answer*, not the query. A made-up passage in
    // canonical style sits much closer to the target passages in vector space than
    // a Swedish query does — measured during planning, it moved the right passage
    // from rank 4 to rank 1. One passage per register AND one per language: see
    // the comment at `hypotheticalPassages`. The language branches aren't a
    // refinement but the precondition for the non-English works being findable at
    // all.
    for (const passage of opts.hypotheticalPassages) {
      if (!passage.trim()) continue;
      embeddings.push(await embedQuery(passage));
    }
    // The filtered branches are computed together: the exact technique shares a
    // single scan across all the passages, and that's what makes it feasible. That
    // sharing became more important with the language branches — nine passages are
    // nine distance columns in the same sweep, not nine scans.
    const ranked = filtered
      ? filteredVectorBranches(db, embeddings, filter)
      : embeddings.map((e) => vectorBranch(db, e));
    for (const r of ranked) branches.push({ name: "vector", ranked: r });
  }
  branches.push({
    name: "keyword",
    ranked: keywordBranch(db, toFtsQuery(opts.keywords), filter),
  });

  // All the passages and not just the treatise's: the branch picks the nearest one
  // itself, and that's how a mentioned Strindberg gets his Swedish original
  // instead of an English vector's notion of it. See `mentionBranch`.
  if (opts.mentions?.length && embeddings.length > 0) {
    branches.push({
      name: "mention",
      ranked: mentionBranch(db, opts.mentions, embeddings, filter),
    });
  }

  // Fetch generously before the selection below: taking only `limit * 2` here
  // would leave nothing left to replace with once duplicates and caps drop items.
  const pool = rerank ? Math.max(RERANK_POOL, limit) : limit * 6;
  const fused = fuse(branches).slice(0, pool * 2);
  if (fused.length === 0) return [];

  const rows = db
    .prepare(
      `select ${PASSAGE_COLUMNS}, c.char_start as charStart, c.char_end as charEnd
         from chunks c
         join works w on w.id = c.work_id
        where c.id in (${fused.map(() => "?").join(",")})`,
    )
    .all(...fused.map(([id]) => id)) as Omit<Candidate, "score" | "sources">[];

  const byId = new Map(rows.map((r) => [r.chunkId, r]));
  const ordered = dedupe(
    fused
      .map(([id, { score, sources }]) => {
        const row = byId.get(id);
        return row ? { ...row, score, sources } : null;
      })
      .filter((c): c is Candidate => c !== null),
  );

  // The order going into the diversity filter decides what survives it, so the
  // cross-encoder must run before it — not after. A per-work cap applied to fusion
  // order throws away a work's best passage because two worse ones came before it.
  // Re-checked alongside `rerank` rather than asserted: `queries` can't have
  // changed since (`const`), but this lets TypeScript narrow it without an
  // assertion that a future edit to the `rerank` condition could silently
  // invalidate.
  let degraded = false;
  let ranked = ordered;
  if (rerank && queries !== undefined) {
    const result = await crossRerank(ordered.slice(0, pool), queries);
    ranked = result.ranked;
    degraded = result.degraded;
  }

  const result = diversify(ranked, limit) as CandidateList;
  result.degraded = degraded;
  return result;
}

/**
 * Picks `limit` candidates with a cap per work and per author, in descending
 * fusion order. What gets crowded out ends up last instead of being discarded — a
 * narrow question that only one work answers should still yield a full list.
 *
 * The caps can be tightened for callers with a different purpose than the results
 * list. The neighbors in `similarChunks` want one author per row, not four —
 * there, the whole point is to get away from the passage you're standing on.
 *
 */
export function diversify<T extends { workId: string; author: string }>(
  candidates: T[],
  limit: number,
  caps: { perWork?: number; perAuthor?: number } = {},
): T[] {
  const maxWork = caps.perWork ?? maxPerWork(limit);
  const maxAuthor = caps.perAuthor ?? maxPerAuthor(limit);
  const perWork = new Map<string, number>();
  const perAuthor = new Map<string, number>();
  const picked: T[] = [];
  const overflow: T[] = [];

  for (const c of candidates) {
    const work = perWork.get(c.workId) ?? 0;
    const author = perAuthor.get(c.author) ?? 0;
    if (work >= maxWork || author >= maxAuthor) {
      overflow.push(c);
      continue;
    }
    perWork.set(c.workId, work + 1);
    perAuthor.set(c.author, author + 1);
    picked.push(c);
    if (picked.length === limit) return picked;
  }
  return [...picked, ...overflow].slice(0, limit);
}

/**
 * The collection contains the same work in multiple editions and translations —
 * the Communist Manifesto, for instance, exists both as "The Communist Manifesto"
 * and "Manifesto of the Communist Party". Without this, two cards in the results
 * list can carry the same text, and reranking ends up paying to read it twice.
 */
function dedupe(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of candidates) {
    const key = c.text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * How many neighbors the KNN fetches before the filters.
 *
 * Not six. A passage's nearest neighbors in vector space are, almost without
 * exception, the neighboring passages in the same work — they're about the same
 * thing, in the same translator's language, often with the same proper names. The
 * question "who else says this?" is exactly the question of what exists *outside*
 * the book you're standing in, so the whole author's oeuvre gets dropped below,
 * and the list must be fetched deep enough to survive that.
 */
const SIMILAR_POOL = 60;

/** A neighbor of a passage. No rationale — nobody has said anything about it. */
export interface SimilarPassage extends PassageRow {
  /** Cosine similarity to the source passage, 0–1. */
  similarity: number;
}

/**
 * The passage itself as query: nearest neighbors to its own vector.
 *
 * Costs nothing. The embedding is already computed and sits in `vec_chunks`, so
 * this is a KNN and a join — no new embedding, no call to Claude. It's the only
 * way onward from a passage that doesn't require a new paid search.
 *
 * The whole author's oeuvre is excluded, not just the work. Multi-volume works
 * live as separate works with IDs that don't share a stem — `…-empire-v` and
 * `…-empire-v-736` are volumes 1 and 6 of *Decline and Fall*, and Buckle numbers
 * his completely differently — so a filter on `work_id` would let volume 6 through
 * as an answer to volume 1. That's the worst possible neighbor: same book, same
 * voice, chosen by the vector precisely because it's the same text. If you want
 * more of the same author, the answer is the work, not a neighbor list, and "show
 * in context" already leads there.
 */
export function similarChunks(chunkId: number, limit = 6): SimilarPassage[] {
  const db = getDb();

  const self = db
    .prepare(
      `select w.author from chunks c join works w on w.id = c.work_id where c.id = ?`,
    )
    .get(chunkId) as { author: string } | undefined;
  if (!self) return [];

  // vec0 hands back the vector as the raw float32 blob it was stored as, and it
  // goes straight back in as a query vector — no decoding needed here.
  const vec = db
    .prepare("select embedding from vec_chunks where chunk_id = ?")
    .get(vecKey(chunkId)) as { embedding: Buffer } | undefined;
  // Front matter is never embedded, and a work may have been re-indexed since the
  // page loaded.
  if (!vec) return [];

  const rows = db
    .prepare(
      `select chunk_id as chunkId, distance
         from vec_chunks
        where embedding match ? and k = ?
        order by distance`,
    )
    .all(vec.embedding, SIMILAR_POOL) as {
    chunkId: number;
    distance: number;
  }[];

  const ids = rows.filter((r) => r.chunkId !== chunkId).map((r) => r.chunkId);
  if (ids.length === 0) return [];

  const meta = db
    .prepare(
      `select ${PASSAGE_COLUMNS}
         from chunks c
         join works w on w.id = c.work_id
        where c.id in (${ids.map(() => "?").join(",")}) and w.author <> ?`,
    )
    .all(...ids, self.author) as PassageRow[];

  const byId = new Map(meta.map((m) => [m.chunkId, m]));
  const distance = new Map(rows.map((r) => [r.chunkId, r.distance]));

  const ordered = ids
    .map((id) => {
      const row = byId.get(id);
      if (!row) return null;
      // The same conversion the semantic cache does: vec0 measures Euclidean
      // distance, not cosine, even for normalized vectors. cos = 1 − d²/2.
      const d = distance.get(id) ?? 0;
      return { ...row, similarity: 1 - (d * d) / 2 };
    })
    .filter((p): p is SimilarPassage => p !== null);

  // A cap per work *and* per author: six rows should be six voices. Without the
  // author cap, the answer to a Gibbon passage becomes the rest of Gibbon, since
  // the six volumes are six separate works.
  return diversify(ordered, limit, { perWork: 1, perAuthor: 1 });
}

/**
 * How many of a work's passages the cross-encoder gets to read in `moreFromWork`.
 *
 * ASSUMED, not measured — and that should stand as written. The number is half of
 * `RERANK_POOL`, chosen because this step runs on its own: the search's 192 pairs
 * sit inside a retrieval clocked at 12.2 s, whereas this is the entire wait, and
 * the user is standing in it after already getting their answer. The batching in
 * `rerank.ts` carries most of it — 96 to 192 pairs cost 0.3 s in
 * `.probe-cross-threshold.ts` — so the number could probably tolerate being
 * raised.
 *
 * What would settle it: a probe measuring how often the passage the cross-encoder
 * ranks highest lies outside the 96 the funnel let through, on works with
 * thousands of passages (Plato has 5,700).
 */
const WORK_POOL = 96;

/**
 * A passage from a work, without a number on the row.
 *
 * The cross-encoder's score travels this far and stops here. The scores are only
 * comparable within the same call — `rerank.ts` says so outright — and a number on
 * the row would invite exactly the comparison it can't bear: between this work's
 * rows and the next work's.
 */
export type WorkPassage = PassageRow;

/**
 * The work's passages nearest the query, as a funnel before reranking.
 *
 * Here the QUERY itself is embedded rather than a hypothetical passage, which is
 * a step down from the chain's HyDE and worth being explicit about. Two reasons
 * make it defensible anyway: the funnel only decides *which* passages get read,
 * never what order they land in — that's the cross-encoder's job — and the
 * selection happens within a single work, i.e. among passages in the same
 * language, in the same translator's prose, and about largely the same thing.
 * It's a much easier choice than the one HyDE exists for.
 *
 * The reason not to write one more HyDE passage is that it would cost a call to
 * Claude, and this whole function is built to be free.
 */
async function nearestInWork(
  db: DB,
  ids: number[],
  query: string,
  k: number,
): Promise<number[]> {
  return scanNearest(db, ids, [await embedQuery(query)], k, "each")[0];
}

/**
 * More passages from a work that already answered — the ones the diversity
 * filter discarded.
 *
 * The diversity filter lets through seven passages per work out of sixty-four,
 * and does it AFTER the cross-encoder has read everything. So when a work turns
 * out to be the essay's center of gravity, it's exactly the ones sorted out that
 * you want, and they've already been read once. Without this route, the only way
 * to reach them is to rephrase the query until the cap happens to fall
 * differently — a paid search to reach passages that were already in hand.
 *
 * Costs nothing. The embedding runs locally, so does the cross-encoder, and no
 * row goes to Claude. The price is latency: `WORK_POOL` pairs at ~70 ms each, most
 * of it absorbed by batching.
 *
 * `exclude` is the passages from the work already present in the answer. Showing
 * them again would be answering the question with what you just read.
 */
export async function moreFromWork(opts: {
  workId: string;
  /**
   * The query in the collection's languages. The work's own is used — a German
   * passage is scored against the German query, as in `crossRerank` and for the
   * same reason.
   */
  queries: Record<Language, string>;
  exclude?: number[];
  limit?: number;
}): Promise<WorkPassage[]> {
  const db = getDb();
  const limit = opts.limit ?? 8;
  const exclude = new Set(opts.exclude ?? []);

  const work = db
    .prepare("select language from works where id = ?")
    .get(opts.workId) as { language: Language } | undefined;
  if (!work) return [];

  // Front matter is never embedded and doesn't belong to the work in the sense the
  // question means: Jowett's introduction to the Republic isn't Plato.
  const ids = (
    db
      .prepare("select id from chunks where work_id = ? and is_front_matter = 0")
      .all(opts.workId) as { id: number }[]
  )
    .map((r) => r.id)
    .filter((id) => !exclude.has(id));
  if (ids.length === 0) return [];

  const query = opts.queries[work.language] ?? opts.queries.sv;
  const pool =
    ids.length > WORK_POOL
      ? await nearestInWork(db, ids, query, WORK_POOL)
      : ids;

  const rows = db
    .prepare(
      `select ${PASSAGE_COLUMNS}
         from chunks c join works w on w.id = c.work_id
        where c.id in (${pool.map(() => "?").join(",")})`,
    )
    .all(...pool) as WorkPassage[];

  // The pool's order is distance order, and that's what holds if reranking is
  // skipped. The database answers in its own order, so this order has to be
  // reimposed.
  const byId = new Map(rows.map((r) => [r.chunkId, r]));
  const ordered = pool
    .map((id) => byId.get(id))
    .filter((r): r is WorkPassage => r !== undefined);

  if (!RERANK_ENABLED) return ordered.slice(0, limit);

  try {
    const scores = await scorePairs(
      ordered.map((c) => ({ query, passage: c.text })),
    );
    return ordered
      .map((passage, i) => ({ passage, score: scores[i] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.passage);
  } catch (err) {
    // Same stance as `crossRerank`: someone searching while the model is
    // downloading should get a worse answer, not an error. Distance order is good
    // enough as a fallback.
    console.warn("[canon] omrankning av verkets stycken hoppades över:", err);
    return ordered.slice(0, limit);
  }
}

/**
 * `getContext`'s own return type is the wire payload minus `sourceUrl`:
 * that field needs the manifest (`passageSourceUrl` in `corpus.ts`), which
 * this module deliberately doesn't depend on — see the comment on the
 * `Language`/`Source` import a few lines up. The route adds it back in
 * before sending `ContextWindowPayload` (`protocol.ts`) out.
 */
export type ContextWindow = Omit<ContextWindowPayload, "sourceUrl">;

/**
 * Fetches the passage with surrounding text from the work's raw file, for "show
 * in context".
 *
 * The radii are kept separate instead of shared: a reader who wants to see what
 * follows a passage rarely wants an equal amount of what came before it too, and a
 * symmetric radius would force twice as much text just to deliver half of what was
 * asked for.
 *
 * Carries `translator`/`year`/`language`/`source` alongside `author`/`title`
 * even though the panel itself only shows the first two — the context sheet
 * is the one place a passage found by a neighbor or a work listing can be
 * saved or cited from, and those actions need the same fields `Citable`
 * (`citation.ts`) needs everywhere else.
 */
export function getContext(
  chunkId: number,
  { before = 3000, after = 3000 }: { before?: number; after?: number } = {},
): ContextWindow | null {
  const db = getDb();
  const row = db
    .prepare(
      `select c.work_id as workId, c.locator, c.char_start as charStart, c.char_end as charEnd,
              w.author, w.title, w.translator, w.year, w.language, w.source
         from chunks c join works w on w.id = c.work_id
        where c.id = ?`,
    )
    .get(chunkId) as
    | {
        workId: string;
        locator: string | null;
        charStart: number;
        charEnd: number;
        author: string;
        title: string;
        translator: string | null;
        year: number;
        language: Language;
        source: Source;
      }
    | undefined;
  if (!row) return null;

  const file = path.join(TEXTS_DIR, `${row.workId}.txt`);
  if (!fs.existsSync(file)) return null;
  const full = fs.readFileSync(file, "utf8");

  const from = Math.max(0, row.charStart - before);
  const to = Math.min(full.length, row.charEnd + after);
  return {
    workId: row.workId,
    author: row.author,
    title: row.title,
    translator: row.translator,
    year: row.year,
    language: row.language,
    source: row.source,
    locator: row.locator,
    // Trim to a paragraph boundary so the window doesn't start mid-sentence.
    before: trimToBoundary(full.slice(from, row.charStart), "start"),
    passage: full.slice(row.charStart, row.charEnd),
    after: trimToBoundary(full.slice(row.charEnd, to), "end"),
    atStart: from === 0,
    atEnd: to === full.length,
  };
}

function trimToBoundary(s: string, side: "start" | "end"): string {
  if (side === "start") {
    const i = s.indexOf("\n\n");
    return i === -1 ? s : s.slice(i + 2);
  }
  const i = s.lastIndexOf("\n\n");
  return i === -1 ? s : s.slice(0, i);
}
