import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { Genre, Language, Source } from "./taxonomy";

export const EMBEDDING_DIM = 384;

export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "canon.db");
export const TEXTS_DIR = path.join(DATA_DIR, "texts");
export const CACHE_DIR = path.join(DATA_DIR, "cache");

export type DB = Database.Database;

// Kept on `globalThis`, not a plain module-level `let`. `next dev`'s hot
// reload re-evaluates this module on nearly every save without restarting
// the process, which would otherwise open a second handle to the same file
// on every reload — the old one never closed, just leaked — and reset
// `handle` to `null` in the new module instance regardless. `globalThis`
// survives the reload, so the handle opened at the start of the dev session
// stays the one in use.
const globalForDb = globalThis as unknown as { __canonDb?: DB };

/**
 * Opens (and creates if needed) the database. Singleton — otherwise Next can
 * open a new handle per request and hit file limits.
 */
export function getDb(): DB {
  if (globalForDb.__canonDb) return globalForDb.__canonDb;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  // The vec0 tables below don't exist without the extension — load before anything else.
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  migrate(db);

  globalForDb.__canonDb = db;
  return db;
}

/**
 * Thrown by `assertIndexed` — its own class so callers that show errors to
 * the user (see `describeError` in claude.ts) can localize the message
 * instead of surfacing this Swedish-only one, which is for the server log.
 */
export class NotIndexedError extends Error {
  constructor() {
    super("samlingen är inte indexerad. Kör `pnpm ingest` innan du söker.");
    this.name = "NotIndexedError";
  }
}

/**
 * How many works are indexed and searchable right now — a cheap count, not
 * a listing. Shared by `assertIndexed` below and by `searches.ts`, which
 * saves this same number alongside a search and compares it against a
 * fresh read of it later to say whether the collection has grown since.
 */
export function corpusWorkCount(db: DB): number {
  const { n } = db.prepare("select count(*) as n from works").get() as {
    n: number;
  };
  return n;
}

/** Throws a comprehensible error if ingest hasn't been run. */
export function assertIndexed(db: DB): void {
  if (corpusWorkCount(db) === 0) {
    throw new NotIndexedError();
  }
}

function migrate(db: DB): void {
  db.exec(`
    create table if not exists works (
      id           text primary key,
      source       text not null default 'gutenberg',
      source_id    text not null default '',
      language     text not null default 'en',
      title        text not null,
      author       text not null,
      translator   text,
      year         integer not null,
      era          text not null,
      genre        text not null default 'filosofi',
      chunk_count  integer not null default 0,
      indexed_at   text not null
    );

    create table if not exists chunks (
      id              integer primary key,
      work_id         text not null references works(id) on delete cascade,
      ordinal         integer not null,
      locator         text,
      is_front_matter integer not null default 0,
      char_start      integer not null,
      char_end        integer not null,
      text            text not null
    );

    create index if not exists chunks_work_idx on chunks(work_id, ordinal);

    create virtual table if not exists chunks_fts using fts5(
      text,
      content='chunks',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    create virtual table if not exists vec_chunks using vec0(
      chunk_id  integer primary key,
      embedding float[${EMBEDDING_DIM}]
    );

    /*
     * Saved searches. Each search costs ~12 cents and used to be thrown
     * away the instant the tab closed. The table gives three things at once:
     * a shareable link, a cache that makes a repeated question free, and an
     * archive of what the collection has actually been asked to answer.
     *
     * Passages are saved as chunk ID plus Claude's rationale, not as text —
     * the text already lives in the chunks table, and a copy of it would go
     * stale the moment a work is re-indexed.
     */
    create table if not exists searches (
      id          integer primary key,
      slug        text not null unique,
      prompt      text not null,
      prompt_norm text not null,
      passages    text not null,
      model       text not null,
      cost        real not null default 0,
      cost_detail text not null default '',
      hits        integer not null default 0,
      created_at  text not null
    );

    create index if not exists searches_norm_idx on searches(prompt_norm, id desc);

    /* The questions' embeddings, for the semantic cache. */
    create virtual table if not exists vec_searches using vec0(
      search_id integer primary key,
      embedding float[${EMBEDDING_DIM}]
    );

    /*
     * Machine-translated passages. Same reason as for the searches table: the
     * translation costs money at Claude and is expensive to throw away, and
     * the same passage turns up again in the next search that hits it — via
     * the cache, the permalink, or someone else's question.
     *
     * The text_hash column is the fingerprint of the source text the
     * translation was made from. Chunk IDs are reused when a work is
     * re-indexed, and then row 4711 can be a completely different passage
     * than the one that was translated: without the hash, the old
     * translation would show up under the new text. If the hash doesn't
     * match, the row counts as a miss and is overwritten.
     */
    create table if not exists translations (
      chunk_id    integer primary key references chunks(id) on delete cascade,
      text_hash   text not null,
      text        text not null,
      model       text not null,
      cost        real not null default 0,
      cost_detail text not null default '',
      created_at  text not null
    );

    /*
     * The query expansion's plans, saved for the sake of the measurements.
     *
     * The query expansion invents four HyDE passages per question, and it
     * invents new ones every time. Two eval runs therefore don't measure the
     * same search: the distance between them is partly the change you wanted
     * to measure and partly the noise in the expansion, and the two can't be
     * told apart afterwards. The table pins the plan to the question, so a
     * change to retrieval can be measured against a fixed baseline — and at
     * the same time makes every run after the first free.
     *
     * Only the measurements read it, never the app. The app's cache lives in
     * searches and is keyed on the whole answer; letting the app share plans
     * between different questions would mean introducing a second similarity
     * threshold, an unmeasured one.
     *
     * The key carries the model. A plan written by Haiku is not a Sonnet
     * plan, and probe-rerank-model switches models between rounds.
     */
    create table if not exists plans (
      prompt_norm text not null,
      model       text not null,
      prompt      text not null,
      plan        text not null,
      cost        real not null default 0,
      created_at  text not null,
      primary key (prompt_norm, model)
    );

    /*
     * Projects: an essay in progress, and the passages it has collected.
     *
     * The searches table is the archive of what was *asked*; this is the
     * archive of what was kept. That difference is the whole reason the
     * table exists. An essay comes together out of a couple dozen questions
     * around the same theme, and the value isn't in any single answer but in
     * the selection between them — which passages you picked from each list
     * and why. Without a place to put them, there was only the export, and
     * that hands the whole bookkeeping over to the user.
     */
    create table if not exists projects (
      id          integer primary key,
      slug        text not null unique,
      title       text not null,
      description text not null default '',
      tags        text not null default '',
      created_at  text not null
    );

    /*
     * A saved passage.
     *
     * The passage's TEXT is not saved, for the same reason as in the
     * searches table: it lives in the chunks table and a copy would go stale
     * the moment the work is re-indexed.
     *
     * text_hash, however, is necessary, and it's the same guard the
     * translations table carries: chunk IDs are reused on re-indexing, so
     * row 4711 can be a completely different passage than the one that was
     * saved. Without the hash, a project would silently swap in an unrelated
     * quotation — and unlike a translation, which just looks odd, a swapped
     * quotation in an essay is a bug that follows straight into the text.
     *
     * prompt and relevance are saved verbatim, and that's no inconsistency
     * with the line above. They're not the collection's text but Claude's
     * answer to a question asked once: the rationale belongs to the
     * question, not to the passage. It should therefore survive the search
     * being forgotten — the project is the user's own work and must not
     * depend on the archive still existing.
     */
    create table if not exists project_passages (
      project_id integer not null references projects(id) on delete cascade,
      chunk_id   integer not null,
      text_hash  text not null,
      prompt     text not null default '',
      relevance  text not null default '',
      note       text not null default '',
      added_at   text not null,
      primary key (project_id, chunk_id)
    );

    create index if not exists project_passages_idx
      on project_passages(project_id, added_at);
  `);

  // Databases built before the genre column already exist on disk and are
  // expensive to rebuild — ~500 passages per work need embedding. Add the
  // columns after the fact; `pnpm ingest` fills in the correct values from
  // the manifest on the next run.
  addColumn(db, "works", "genre", "text not null default 'filosofi'");
  addColumn(db, "works", "source", "text not null default 'gutenberg'");
  addColumn(db, "works", "source_id", "text not null default ''");
  addColumn(db, "works", "language", "text not null default 'en'");

  /*
   * The cost breakdown came after the cost itself. Old rows only have the
   * total left and get an empty string here: the UI then shows the total
   * without a table, which is true — the lines don't exist, because they
   * were never saved.
   */
  addColumn(db, "searches", "cost_detail", "text not null default ''");

  /*
   * The subjects and eras the search was made with — an empty string for the
   * whole collection, which is what every row saved before the filter
   * existed actually was. Both columns are part of the cache key: the same
   * question put to poetry is not the same search as the same question put
   * to everything, and they must not share an answer.
   */
  addColumn(db, "searches", "genres", "text not null default ''");
  addColumn(db, "searches", "eras", "text not null default ''");

  /*
   * The question in the collection's six languages, as the expansion wrote it.
   *
   * NOT part of the cache key — it's the same question, and the forms are
   * derived from it. They're saved for "more from this work," which scores
   * with the cross-encoder and therefore needs the question in the passage's
   * own language. The alternative would be letting the app read `plans`, and
   * that table belongs to the measurements: the app shouldn't be affected by
   * a plan a probe happened to write.
   *
   * Rows saved before the column existed have an empty string and fall back
   * to the Swedish question for every language. The price for that is
   * measured in `.probe-rerank.ts`: the same question asked in Swedish and
   * in English gave 8 of 10 shared in the top ten and Spearman 0.80 across
   * forty candidates. Useful, then, but not free.
   */
  addColumn(db, "searches", "queries", "text not null default ''");
  addColumn(db, "translations", "cost_detail", "text not null default ''");

  /*
   * Wall-clock time the search took to run, in milliseconds — retrieval and
   * both Claude calls, measured server-side up to the point the answer is
   * saved. Rows written before this column existed default to 0, and the UI
   * (see `durationMs` on `StoredSearch` in searches.ts) reads that as "not
   * measured" rather than as an instant search.
   */
  addColumn(db, "searches", "duration_ms", "integer not null default 0");

  /*
   * Description and tags came after projects already had rows. Empty string
   * for both on old projects, which is true — they were written before the
   * fields existed. Tags are stored comma-separated, like `genres`/`eras` on
   * the searches table: same convention, same reason to avoid a separate
   * table for a list of words.
   */
  addColumn(db, "projects", "description", "text not null default ''");
  addColumn(db, "projects", "tags", "text not null default ''");

  /*
   * How many works were in the collection when this search ran — `select
   * count(*) from works` at save time, not a running total. Neither the
   * exact cache nor the semantic one knows how large the corpus was when an
   * answer was computed, so a question asked before the French, German and
   * Latin sources existed still answers from them today, silently. Compared
   * against today's count wherever a cached answer or a permalink is shown
   * (see `findCached`/`loadSearch` in searches.ts); 0 for a row saved before
   * this column existed, which is deliberately never bigger than today's
   * count and therefore never claims growth it has no record of.
   */
  addColumn(db, "searches", "corpus_works", "integer not null default 0");

  retireGutenbergId(db);
}

/**
 * `gutenberg_id` was replaced by `source`/`source_id` when the collection
 * gained sources beyond Gutenberg. The value is moved over; the column is
 * left in place.
 *
 * Dropping it instead with `alter table drop column` would be cleaner on
 * disk and dangerous in practice. The most common moment to restart the
 * server is in the middle of a multi-hour `pnpm ingest`, and that run has
 * already prepared its insert against the old schema: if the migration pulls
 * the column out from under it, every remaining work fails, one at a time,
 * until the run ends. One extra column in an old database is the cheaper
 * price. Ingest fills it in for as long as it exists — see `workInserter`.
 */
function retireGutenbergId(db: DB): void {
  if (!hasColumn(db, "works", "gutenberg_id")) return;
  db.exec(
    "update works set source_id = cast(gutenberg_id as text) where source_id = ''",
  );
}

/** Does the column exist? Ingest needs to know if the old `gutenberg_id` still lives on. */
export function hasColumn(db: DB, table: string, column: string): boolean {
  const cols = db.prepare(`pragma table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

/** `alter table add column` has no `if not exists` in SQLite. */
function addColumn(
  db: DB,
  table: string,
  column: string,
  definition: string,
): void {
  if (hasColumn(db, table, column)) return;
  db.exec(`alter table ${table} add column ${column} ${definition}`);
}

/**
 * vec0 only accepts integers as primary key, and better-sqlite3 binds
 * ordinary JS numbers in a way the extension rejects ("Only integers are
 * allows for primary key values"). BigInt is the way around that.
 */
export function vecKey(id: number): bigint {
  return BigInt(id);
}

/**
 * The columns every passage read selects, for `chunks c join works w`.
 *
 * One fragment instead of one copy per reader: the list was written out in
 * five places (retrieval, neighbours, more-from-work, the archive, the
 * projects), and a field added to the payload in one of them would have
 * reached the results list but not the permalink showing the same answer.
 */
export const PASSAGE_COLUMNS = `c.id as chunkId, c.work_id as workId, c.locator, c.text,
       w.author, w.title, w.translator, w.year, w.genre, w.language, w.source`;

/** A row read with `PASSAGE_COLUMNS`. */
export interface PassageRow {
  chunkId: number;
  workId: string;
  locator: string | null;
  text: string;
  author: string;
  title: string;
  translator: string | null;
  year: number;
  genre: Genre;
  language: Language;
  source: Source;
}

/** vec0 takes vectors as raw float32 blobs. */
export function vecBlob(v: Float32Array | number[]): Buffer {
  const f32 = v instanceof Float32Array ? v : new Float32Array(v);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/**
 * Removes a work and everything attached to it, so ingest can be rerun.
 *
 * Everything below runs in one transaction. It used to commit per chunk (one
 * FTS delete, one vector delete, each on its own), and a crash partway
 * through left FTS rows removed while their chunks remained — the next run
 * then re-issued `delete` on rows already gone, which FTS5's own docs say
 * corrupts the index. A single transaction makes the whole removal atomic:
 * either the work is gone everywhere, or it's still exactly as it was.
 */
export function deleteWork(db: DB, workId: string): void {
  const rows = db
    .prepare("select id, text from chunks where work_id = ?")
    .all(workId) as { id: number; text: string }[];
  const delFts = db.prepare(
    "insert into chunks_fts(chunks_fts, rowid, text) values ('delete', ?, ?)",
  );
  const delVec = db.prepare("delete from vec_chunks where chunk_id = ?");

  const run = db.transaction(() => {
    for (const { id, text } of rows) {
      delFts.run(id, text);
      delVec.run(vecKey(id));
    }
    db.prepare("delete from chunks where work_id = ?").run(workId);
    db.prepare("delete from works where id = ?").run(workId);
  });
  run();
}
