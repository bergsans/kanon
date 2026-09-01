/**
 * Saved searches: permalink and cache in the same table.
 *
 * A search costs around twelve cents and used to take its result to the grave
 * when the tab closed. Saving it gives three things for the same price:
 *
 *   - a shareable link, /s/<slug>, that shows the exact same answer to someone else
 *   - a cache: the same question again costs nothing and answers instantly
 *   - an archive of what the collection has actually been asked to answer
 *
 * Only the chunk ID and Claude's rationale are saved. The passage text lives
 * in the chunks table and is read from there every time — a copy would go
 * stale the moment a work was re-indexed.
 */
import crypto from "node:crypto";
import {
  corpusWorkCount,
  getDb,
  PASSAGE_COLUMNS,
  vecBlob,
  vecKey,
  type DB,
  type PassageRow,
} from "./db";
import { embedQuery } from "./embed";
import { totalCost } from "./claude";
import { toPassagePayload, type Language } from "./corpus";
import { textHash } from "./hash";
import {
  CORPUS_LANGUAGES,
  eraKey,
  genreKey,
  parseEras,
  parseGenres,
  NO_FILTER,
  type CorpusFilter,
} from "./taxonomy";
import type { CostStep, PassagePayload } from "./protocol";

/**
 * An env var that's set but empty must fall back like an unset one, not
 * silently become `0` (`Number("")` is `0`, not `NaN`) — see `SIMILARITY`.
 */
function parsedFloat(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * How similar two questions must be to count as the same question.
 *
 * MEASURED, not guessed — and the threshold sits where it sits because the
 * classes overlap. Cosine similarity between rephrasings of the same question
 * fell between 0.87 and 0.97; between related but distinct questions, between
 * 0.79 and 0.93. "Does a prince need power more than morals?" and its mirror
 * "Does a citizen need morals more than power?" land at 0.93 and must never
 * share an answer. 0.95 leaves margin above that value while still catching
 * the obvious cases — "what is the good life?" against "what is a good life?"
 * lands at 0.97.
 *
 * Better a missed cache hit than an answer to the wrong question. Set
 * CANON_CACHE_SIMILARITY=0 to disable the semantic cache entirely; the exact
 * one still works.
 *
 * See `scripts/.probe-cache.ts` for the measurement.
 *
 * `Number("")` is `0`, indistinguishable from the deliberate
 * `CANON_CACHE_SIMILARITY=0` below — so an env var that's set but left empty
 * (a stray `CANON_CACHE_SIMILARITY=` in .env.local) must be caught before it
 * reaches `Number()`, or it silently disables the cache instead of falling
 * back to the measured 0,95.
 */
const SIMILARITY = parsedFloat(process.env.CANON_CACHE_SIMILARITY, 0.95);

/**
 * vec0 measures Euclidean distance, not cosine — even though the column holds
 * normalized vectors. For unit vectors, d² = 2(1 − cos), so cos = 1 − d²/2.
 *
 * The difference is not academic: the same question rephrased gives d ≈ 0.25,
 * and reading that as a cosine distance gives a similarity of 0.75 instead of
 * 0.97, and a cache that never hits. Both metrics rank things the same way, so
 * the error never shows up in search — only here, where an absolute number is
 * compared against a threshold.
 */
function cosineFromL2(distance: number): number {
  return 1 - (distance * distance) / 2;
}

export interface StoredSearch {
  slug: string;
  prompt: string;
  /** The subjects and eras the question was put to. Empty = the whole collection. */
  filter: CorpusFilter;
  /**
   * The question in the collection's language, as the expansion wrote it.
   *
   * Saved for "more from this work", which scores with the cross-encoder and
   * therefore needs the question in the passage's own language. See the
   * column comment in `db.ts` for why it isn't read from `plans` instead, and
   * what the fallback form costs.
   */
  queries: Record<Language, string>;
  createdAt: string;
  /** Which model answered — Claude's model id, or an Ollama tag. Always set: the column is `not null`. */
  model: string;
  /** What the search cost when it ran — not what it costs to read now. */
  cost: number;
  /**
   * The calls behind that cost, line by line. Empty for searches saved before
   * the breakdown existed: then only the total remains, and the UI shows it
   * without a table rather than inventing lines that were never saved.
   */
  steps: CostStep[];
  /**
   * How long the search took to run, in milliseconds, the day it was made —
   * not how long it takes to open this permalink now, which is instant.
   * Zero for rows saved before the column existed, and read by the UI as
   * "not measured" rather than as a search that took no time.
   */
  durationMs: number;
  /**
   * How many works were in the collection when this search ran — 0 for a
   * row saved before this column existed. Compared against
   * `corpusWorkCount` wherever the answer is shown again (a cache hit, a
   * permalink) to say whether the collection has since grown; see
   * `corpusGrowthSince` below and the column's own comment in `db.ts`.
   */
  corpusWorks: number;
  passages: PassagePayload[];
}

/**
 * How many more works exist now than when a search with this
 * `corpusWorks` figure ran.
 *
 * 0 for a row saved before the column existed (`savedCorpusWorks === 0`) —
 * not "the collection grew by every work it has", which is what a naive
 * subtraction against an unknown baseline of 0 would say. Better a missed
 * notice on an old row than a claim with no real baseline behind it.
 * Otherwise never negative: `Math.max` keeps a stale figure from
 * undercounting into "the collection shrank", which isn't this feature's
 * question to answer.
 */
export function corpusGrowthSince(savedCorpusWorks: number): number {
  if (savedCorpusWorks <= 0) return 0;
  return Math.max(0, corpusWorkCount(getDb()) - savedCorpusWorks);
}

export interface PassageRef {
  chunkId: number;
  /**
   * `textHash` of the passage as it was when the search ran.
   *
   * The same guard `translations` and `project_passages` carry: chunk IDs are
   * reused on re-indexing, and without it a permalink or a cache hit would
   * show a different passage under a rationale written for the old one —
   * which reads as Claude being wrong, not as the index having moved.
   *
   * Missing on rows saved before the field existed. Those are shown as
   * before, unverified: there is nothing to compare against, and dropping
   * them would turn every old permalink into a miss to guard against a swap
   * that has most likely not happened.
   */
  textHash?: string;
  /**
   * Null for a candidate that was retrieved but not chosen.
   *
   * New searches save only the chosen ones and never write null here. The
   * field remains for rows saved back when the whole candidate list was kept —
   * those still sit in the database, and an old permalink should show the same
   * page as a new one instead of carrying along a rejected passage with no
   * rationale.
   */
  relevance: string | null;
}

/** The selection out of a saved row: that is all the answer consists of. */
function chosen(refs: PassageRef[]): (PassageRef & { relevance: string })[] {
  return refs.filter(
    (r): r is PassageRef & { relevance: string } => !!r.relevance,
  );
}

/**
 * The key for the exact cache. Case, whitespace and trailing punctuation do
 * not distinguish two questions — "Vad är det goda livet?" and "vad är det
 * goda livet" should share an answer without anyone needing to compute a
 * vector distance.
 */
export function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?…\s]+$/u, "")
    .trim();
}

/** Short and distinguishable; collisions are caught by the unique index and retried. */
function newSlug(): string {
  return crypto.randomBytes(5).toString("base64url");
}

/**
 * Reads the passages back out of the database.
 *
 * Passages that no longer exist are skipped: a work may have been re-indexed
 * since the search was saved, leaving the old IDs pointing at nothing — or at
 * a different passage, which the stored `textHash` catches. If all of them
 * are gone, the saved search is worthless and is treated as a miss.
 */
function hydrate(db: DB, stored: PassageRef[]): PassagePayload[] {
  const refs = chosen(stored);
  if (refs.length === 0) return [];
  const rows = db
    .prepare(
      `select ${PASSAGE_COLUMNS}
         from chunks c join works w on w.id = c.work_id
        where c.id in (${refs.map(() => "?").join(",")})`,
    )
    .all(...refs.map((r) => r.chunkId)) as PassageRow[];

  const byId = new Map(rows.map((r) => [r.chunkId, r]));
  return refs
    .flatMap((ref) => {
      const row = byId.get(ref.chunkId);
      // A reused ID is the same as a vanished one: the rationale was written
      // for a text that is no longer there. See `textHash` on `PassageRef`.
      if (!row || (ref.textHash && ref.textHash !== textHash(row.text))) {
        return [];
      }
      return [{ row, relevance: ref.relevance }];
    })
    .map(({ row, relevance }, i) => toPassagePayload(row, relevance, i + 1));
}

interface Row {
  id: number;
  slug: string;
  prompt: string;
  genres: string | null;
  eras: string | null;
  queries: string | null;
  passages: string;
  model: string;
  cost: number;
  cost_detail: string | null;
  duration_ms: number;
  corpus_works: number;
  created_at: string;
}

/**
 * The question forms out of the row, falling back to the Swedish question for
 * every language.
 *
 * The fallback applies to every row saved before the column existed, and it
 * is not free: `.probe-rerank.ts` measured the same question asked in Swedish
 * versus English at 8 of 10 shared in the top ten and Spearman 0.80. Not
 * ranking at all would be worse — then the list sits in distance order from a
 * question vector, which is exactly what the cross-encoder exists to avoid.
 */
function rowQueries(row: {
  prompt: string;
  queries: string | null;
}): Record<Language, string> {
  if (row.queries) {
    try {
      const parsed = JSON.parse(row.queries) as Partial<
        Record<Language, string>
      >;
      const full = Object.fromEntries(
        CORPUS_LANGUAGES.map((l) => [l, parsed[l] || row.prompt]),
      ) as Record<Language, string>;
      return full;
    } catch {
      // Falls through to the fallback below: a corrupted row should produce a
      // worse reranking, not an error in a function that otherwise works.
    }
  }
  return Object.fromEntries(
    CORPUS_LANGUAGES.map((l) => [l, row.prompt]),
  ) as Record<Language, string>;
}

/**
 * The cost breakdown out of the database. A row from before the column
 * existed, or one written by an older version, must not sink an otherwise
 * intact search — the total in `cost` remains and is enough to show something
 * true.
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
 * The passage list out of a row's `passages` column, or `null` if it doesn't
 * parse. Same reasoning as `parseSteps` right above it, but this one used to
 * be missing: an unguarded `JSON.parse` here didn't just weaken one row, it
 * threw out of `toStored` and `toSummary` alike — one corrupt row broke the
 * permalink, the front page's recent list, and `/sokningar` all at once.
 */
function parsePassages(raw: string): PassageRef[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PassageRef[]) : null;
  } catch {
    return null;
  }
}

/** The columns turned back into a filter. Empty column = the whole collection. */
function rowFilter(row: {
  genres: string | null;
  eras: string | null;
}): CorpusFilter {
  return {
    genres: parseGenres(row.genres?.split(",")),
    eras: parseEras(row.eras?.split(",")),
  };
}

function toStored(db: DB, row: Row): StoredSearch | null {
  const refs = parsePassages(row.passages);
  if (!refs) return null;
  const passages = hydrate(db, refs);
  if (passages.length === 0) return null;
  return {
    slug: row.slug,
    prompt: row.prompt,
    filter: rowFilter(row),
    queries: rowQueries(row),
    createdAt: row.created_at,
    model: row.model,
    cost: row.cost,
    steps: parseSteps(row.cost_detail),
    durationMs: row.duration_ms,
    corpusWorks: row.corpus_works,
    passages,
  };
}

/** Fetches a saved search by its slug — what the permalink does. */
export function loadSearch(slug: string): StoredSearch | null {
  const db = getDb();
  const row = db.prepare("select * from searches where slug = ?").get(slug) as
    | Row
    | undefined;
  return row ? toStored(db, row) : null;
}

/**
 * Looks for a previous answer to the same question.
 *
 * Two steps: an exact match on the normalized question, then a vector
 * comparison against previous questions. The first is free, the second costs
 * one local embedding — a fraction of a second, and nothing at Claude.
 *
 * Accepted gap: two identical questions arriving at once both miss here and
 * both run and pay for the full pipeline in `/api/search`, since there's no
 * lock spanning this check and the `saveSearch` that follows it. A single
 * reader never triggers this, and the app has no concurrent audience today —
 * coalescing the two into one paid run would mean sharing one in-flight
 * pipeline across requests in a streaming route, which needs a live search to
 * verify and isn't worth doing speculatively (see AGENTS.md on `pnpm eval`
 * and dev searches costing real money).
 *
 * The caller (route.ts) tells a semantic hit's *differently-worded* stored
 * question apart from an exact hit's own by comparing
 * `normalizePrompt(stored.prompt)` against the prompt just asked — no flag
 * for which route found the row is needed for that: an exact hit matched on
 * `prompt_norm = normalizePrompt(prompt)` in the query below, and
 * `saveSearch` always writes `prompt_norm` as `normalizePrompt(prompt)` at
 * save time, so for any exact hit that same comparison is already, and
 * unavoidably, false.
 */
export async function findCached(
  prompt: string,
  filter: CorpusFilter = NO_FILTER,
  /**
   * Claude's and the local model's answers never land in each other's
   * cache. The same question gave 38% shared passages between the two
   * in `.probe-rerank-local.ts` — without this guard, whoever asked first
   * would silently decide the quality everyone asking afterward got.
   */
  model: string,
): Promise<StoredSearch | null> {
  const db = getDb();
  const genres = genreKey(filter.genres);
  const eras = eraKey(filter.eras);

  const exact = db
    .prepare(
      `select * from searches
        where prompt_norm = ? and genres = ? and eras = ? and model = ?
        order by id desc limit 1`,
    )
    .get(normalizePrompt(prompt), genres, eras, model) as Row | undefined;
  if (exact) {
    const stored = toStored(db, exact);
    if (stored) {
      db.prepare("update searches set hits = hits + 1 where id = ?").run(
        exact.id,
      );
      return stored;
    }
  }

  if (!(SIMILARITY > 0)) return null;

  const { n } = db.prepare("select count(*) as n from searches").get() as {
    n: number;
  };
  if (n === 0) return null;

  /*
   * Five neighbours and not one, since the subject filter joined the key.
   *
   * The vector only knows the question's words, not which subjects it was put
   * to, and most saved searches are unfiltered. The nearest neighbour to "what
   * is freedom?" put to poetry is therefore almost always the same question
   * put to the whole collection — an answer that looks right and is drawn from
   * the wrong material. With k=1 that meant either a wrong hit or, if the row
   * was rejected, a miss that could never become anything else. Five is enough
   * for the filtered twin to make it into the list; the threshold decides the
   * rest and is unchanged.
   */
  const nearest = db
    .prepare(
      `select search_id as searchId, distance
         from vec_searches
        where embedding match ? and k = 5
        order by distance`,
    )
    .all(vecBlob(await embedQuery(prompt))) as {
    searchId: number;
    distance: number;
  }[];

  const readRow = db.prepare("select * from searches where id = ?");
  for (const near of nearest) {
    const similarity = cosineFromL2(near.distance);
    // The list is sorted: if this one is too dissimilar, so is the rest.
    if (similarity < SIMILARITY) return null;
    const row = readRow.get(near.searchId) as Row | undefined;
    if (
      !row ||
      (row.genres ?? "") !== genres ||
      (row.eras ?? "") !== eras ||
      row.model !== model
    )
      continue;
    const stored = toStored(db, row);
    if (!stored) continue;
    db.prepare("update searches set hits = hits + 1 where id = ?").run(row.id);
    // The question itself doesn't go to the log — a search a reader typed
    // has no business in server logs when only the hit/miss rate is needed
    // to see whether the cache is doing its job.
    console.log(
      `[canon] cacheträff (likhet ${similarity.toFixed(3)})` +
        (genres || eras
          ? ` [${[genres, eras].filter(Boolean).join(" · ")}]`
          : ""),
    );
    return stored;
  }
  return null;
}

/** Saves a finished search and returns its slug. */
export async function saveSearch(
  prompt: string,
  passages: PassageRef[],
  steps: CostStep[],
  filter: CorpusFilter = NO_FILTER,
  /** Which model answered — the same guard against wrong cache hits as in `findCached`. */
  model: string,
  /**
   * Wall-clock time the search took to run, in milliseconds — measured by the
   * caller from the moment the cache lookup missed to the moment the answer
   * was ready to save. Archived alongside the cost for the same reason: both
   * are what this particular run spent, not what a cache hit spends reading
   * the answer back.
   */
  durationMs: number,
  /**
   * The question in the collection's language. Omitted, the column stays
   * empty and the read falls back to the Swedish question — see `rowQueries`.
   */
  queries?: Record<Language, string>,
): Promise<string> {
  const db = getDb();
  const embedding = SIMILARITY > 0 ? await embedQuery(prompt) : null;

  // The total is saved alongside the breakdown even though it can be derived
  // from it. It is the number that needs to be sortable and summable in SQL
  // without parsing JSON first, and it is the only thing that survives if the
  // breakdown's format ever changes.
  const cost = totalCost(steps);
  // The collection's size right now, so a later cache hit or permalink open
  // can say how much it's grown since — see `corpusGrowthSince` and the
  // column's own comment in db.ts.
  const corpusWorks = corpusWorkCount(db);

  const insert = db.prepare(
    `insert into searches (slug, prompt, prompt_norm, genres, eras, queries, passages, model, cost, cost_detail, duration_ms, corpus_works, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertVec = db.prepare(
    "insert into vec_searches (search_id, embedding) values (?, ?)",
  );

  // Both inserts commit together, or neither does. They used to be two
  // separate statements: if `insertVec` threw (a stale `vec_searches` row —
  // `integer primary key` without AUTOINCREMENT reuses ids — or the database
  // busy during a concurrent ingest), the retry loop below ran again and left
  // a `searches` row already committed, with no `vec_searches` row and no way
  // back to it — up to five archived duplicates for one search.
  const insertBoth = db.transaction((slug: string) => {
    const info = insert.run(
      slug,
      prompt,
      normalizePrompt(prompt),
      genreKey(filter.genres),
      eraKey(filter.eras),
      queries ? JSON.stringify(queries) : "",
      JSON.stringify(passages),
      model,
      cost,
      JSON.stringify(steps),
      Math.round(durationMs),
      corpusWorks,
      new Date().toISOString(),
    );
    if (embedding) {
      insertVec.run(vecKey(Number(info.lastInsertRowid)), vecBlob(embedding));
    }
  });

  // The slug is five random bytes. The collision will not happen, but the
  // only place it would show up is the unique index — so let that decide it.
  // Only that specific error is worth a retry: anything else (a busy
  // database, a schema problem) would just fail identically five times and
  // hide its real cause behind "Kunde inte spara sökningen."
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = newSlug();
    try {
      insertBoth(slug);
      return slug;
    } catch (err) {
      const isSlugCollision =
        err instanceof Error &&
        "code" in err &&
        err.code === "SQLITE_CONSTRAINT_UNIQUE";
      if (!isSlugCollision || attempt === 4) throw err;
    }
  }
  throw new Error("Kunde inte spara sökningen.");
}

export interface SearchSummary {
  slug: string;
  prompt: string;
  /**
   * The subjects and eras the question was put to. Empty = the whole collection.
   *
   * Carried along into the list because two rows could otherwise bear the same
   * words and lead to different answers — the same question put to poetry and
   * to everything are two different searches, and the row is the only place
   * the difference can show before a click.
   */
  filter: CorpusFilter;
  createdAt: string;
  /** Which model answered — shown next to the passage count. */
  model: string;
  passageCount: number;
  /** What the search cost when it ran — 0 for a cache hit, same figure `StoredSearch.cost` carries. */
  cost: number;
}

interface SummaryRow {
  slug: string;
  prompt: string;
  genres: string | null;
  eras: string | null;
  createdAt: string;
  model: string;
  passages: string;
  cost: number;
}

const SUMMARY_COLUMNS =
  "slug, prompt, genres, eras, created_at as createdAt, model, passages, cost";

function toSummary(r: SummaryRow): SearchSummary | null {
  const refs = parsePassages(r.passages);
  if (!refs) return null;
  return {
    slug: r.slug,
    prompt: r.prompt,
    filter: rowFilter(r),
    createdAt: r.createdAt,
    model: r.model,
    // Only the chosen ones count — that is what the row promises to show on click.
    passageCount: chosen(refs).length,
    cost: r.cost,
  };
}

/** `.map(toSummary)` filtered down to the rows that actually parsed. */
function summarize(rows: SummaryRow[]): SearchSummary[] {
  return rows.map(toSummary).filter((s): s is SearchSummary => s !== null);
}

/** The most recent searches — the front page's examples, drawn from reality. */
export function recentSearches(limit = 6): SearchSummary[] {
  const rows = getDb()
    .prepare(`select ${SUMMARY_COLUMNS} from searches order by id desc limit ?`)
    .all(limit) as SummaryRow[];
  return summarize(rows);
}

/**
 * Every saved search, newest first — the archive as its own page
 * (`/sokningar`), rather than the six-row preview `recentSearches` gives
 * the sidebar. No limit: the app is a personal research tool, and the same
 * unbounded-list-plus-client-filter approach already works for the ~2700
 * works on `/samling`.
 */
export function allSearches(): SearchSummary[] {
  const rows = getDb()
    .prepare(`select ${SUMMARY_COLUMNS} from searches order by id desc`)
    .all() as SummaryRow[];
  return summarize(rows);
}

/**
 * Forgets a saved search.
 *
 * Removes both the row and its embedding: if vec_searches were left behind it
 * would point at an id that no longer exists, and the next semantic cache
 * lookup would hit nothing and produce a miss that looks like a bug. The two
 * deletions belong together and run in the same transaction.
 *
 * Only the search disappears. The passages it pointed to live in the chunks
 * table and are untouched — that is the collection, not the archive.
 *
 * Returns false if the slug didn't exist, so the caller can distinguish
 * "deleted now" from "never existed" instead of pretending both succeeded.
 */
export function deleteSearch(slug: string): boolean {
  const db = getDb();
  const row = db.prepare("select id from searches where slug = ?").get(slug) as
    | { id: number }
    | undefined;
  if (!row) return false;

  db.transaction(() => {
    db.prepare("delete from vec_searches where search_id = ?").run(
      vecKey(row.id),
    );
    db.prepare("delete from searches where id = ?").run(row.id);
  })();
  return true;
}
