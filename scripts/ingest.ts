/**
 * Builds the search index from the collection manifest.
 *
 *   pnpm ingest                       the whole collection (skips already-indexed works)
 *   pnpm ingest --only=1497,rodarum   only these works, given as the source's ID
 *   pnpm ingest --source=runeberg     only works from one source
 *   pnpm ingest --force               reindex even what's already there
 *   pnpm ingest --limit=5             only the first five works
 */
import fs from "node:fs";
import path from "node:path";
import { CORPUS, SOURCE_LABEL, type CanonWork } from "../src/lib/corpus";
import { chunkText } from "../src/lib/chunk";
import { embedPassages } from "../src/lib/embed";
import { fetchWorkText } from "../src/lib/sources";
import {
  deleteWork,
  getDb,
  hasColumn,
  TEXTS_DIR,
  vecBlob,
  vecKey,
  type DB,
} from "../src/lib/db";

/**
 * How many passages `embedPassages` encodes per ONNX call during indexing.
 *
 * Not measured — assumed. The one related measurement in this repo,
 * `.probe-embed-batch.ts`, found that batching shifts vectors (min cosine
 * 0.99938 against the sequential result) because shorter passages in a
 * batch get padded up to the batch's longest and land differently under
 * the q8-quantized model — but it measured *query-time* batching (nine
 * HyDE passages) and rejected it on cost grounds, not on that shift being
 * unacceptable. Whether 32 is a good number for *indexing* throughput
 * specifically, and whether the same padding shift matters once these
 * vectors sit in `vec_chunks` rather than being compared to a live query,
 * hasn't been probed.
 */
const BATCH = 32;

function parseArgs() {
  const args = process.argv.slice(2);
  // The source's ID, not the manifest's slug: "1497" (Gutenberg),
  // "lb472691" (Litteraturbanken), "rodarum" (Runeberg). That's what appears in error messages.
  const only = args
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const source = args
    .find((a) => a.startsWith("--source="))
    ?.slice("--source=".length);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg
    ? Number(limitArg.slice("--limit=".length))
    : undefined;
  return { only, source, force: args.includes("--force"), limit };
}

/**
 * Inserting a work. The work must exist before the chunks —
 * chunks.work_id is a foreign key — and chunk_count is only filled in
 * once we know how many actually made it in.
 *
 * The old `gutenberg_id` column remains in databases built before the
 * multiple sources (see `retireGutenbergId` in db.ts). It's `not null`,
 * so it must be filled in as long as it exists — with the source's ID,
 * which for a Gutenberg work is exactly the number the column always
 * carried, and for the other sources becomes zero.
 */
const WORK_COLUMNS =
  "id, source, source_id, language, title, author, translator, year, era, genre, chunk_count, indexed_at";

// Memoized on the module, not per call — the process only ever opens one
// database (`getDb`'s own singleton handle), so the prepared statement
// below never needs to change. The returned function used to take a `db`
// parameter of its own and ignore it, a leftover from before the
// memoization existed; dropped, since a call site passing a second,
// different handle here would silently keep using the first one anyway.
let insertWork: ((work: CanonWork) => void) | null = null;

function workInserter(db: DB): (work: CanonWork) => void {
  if (insertWork) return insertWork;
  const legacy = hasColumn(db, "works", "gutenberg_id");
  const stmt = db.prepare(
    legacy
      ? `insert into works (${WORK_COLUMNS}, gutenberg_id)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, cast(? as integer))`
      : `insert into works (${WORK_COLUMNS})
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  );
  insertWork = (w) => {
    const now = new Date().toISOString();
    if (legacy) {
      stmt.run(
        w.id,
        w.source,
        w.sourceId,
        w.language,
        w.title,
        w.author,
        w.translator ?? null,
        w.year,
        w.era,
        w.genre,
        now,
        w.sourceId,
      );
    } else {
      stmt.run(
        w.id,
        w.source,
        w.sourceId,
        w.language,
        w.title,
        w.author,
        w.translator ?? null,
        w.year,
        w.era,
        w.genre,
        now,
      );
    }
  };
  return insertWork;
}

async function ingestWork(
  db: DB,
  work: CanonWork,
  force: boolean,
): Promise<number> {
  const existing = db
    .prepare("select chunk_count from works where id = ?")
    .get(work.id) as { chunk_count: number } | undefined;

  // chunk_count is only set once the work is fully in, so zero means an
  // aborted run — reindex instead of skipping.
  if (existing && existing.chunk_count > 0 && !force) {
    console.log(
      `  ⏭  ${work.id} — redan indexerad (${existing.chunk_count} stycken)`,
    );
    return 0;
  }

  // Fetched (and rights-checked — see the source module's own check inside
  // `fetchWorkText`) before anything already indexed is touched. `--force`
  // used to delete first: a failed fetch or a rights check that no longer
  // passes then lost a work that was already searchable, for nothing —
  // the run just aborts on the throw below, and the old rows are gone.
  const text = await fetchWorkText(work);

  if (existing) deleteWork(db, work.id);

  fs.mkdirSync(TEXTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEXTS_DIR, `${work.id}.txt`), text, "utf8");

  const chunks = chunkText(text, work.language);
  const body = chunks.filter((c) => !c.isFrontMatter);
  console.log(
    `  ${(text.length / 1000).toFixed(0)}k tecken → ${chunks.length} stycken ` +
      `(${chunks.length - body.length} förtext)`,
  );

  workInserter(db)(work);

  const insertChunk = db.prepare(
    `insert into chunks (work_id, ordinal, locator, is_front_matter, char_start, char_end, text)
     values (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare(
    "insert into chunks_fts(rowid, text) values (?, ?)",
  );
  const insertVec = db.prepare(
    "insert into vec_chunks(chunk_id, embedding) values (?, ?)",
  );

  // Rows first, so we have ids to attach embeddings to.
  const ids: number[] = db.transaction(() => {
    const out: number[] = [];
    for (const c of chunks) {
      const info = insertChunk.run(
        work.id,
        c.ordinal,
        c.locator,
        c.isFrontMatter ? 1 : 0,
        c.charStart,
        c.charEnd,
        c.text,
      );
      const id = Number(info.lastInsertRowid);
      insertFts.run(id, c.text);
      out.push(id);
    }
    return out;
  })();

  // SQLite reuses rowids after a deletion, and `vec_chunks` is its own
  // virtual table with no foreign key to `chunks`. If a vector row
  // outlives its chunk — which 948 rows in the database showed they do —
  // the next work that happens to get the same rowid gets a "UNIQUE
  // constraint failed on vec_chunks", and the work is aborted. That took
  // down 15 of 103 Perseus works in one full run. The cleanup is cheap
  // and self-healing: it only touches the ids just written.
  const delStale = db.prepare("delete from vec_chunks where chunk_id = ?");
  db.transaction(() => {
    for (const id of ids) delStale.run(vecKey(id));
  })();

  // Embeddings in batches — the heavy part. Body text only; front matter isn't searched.
  const targets = chunks
    .map((c, i) => ({ chunk: c, id: ids[i] }))
    .filter((t) => !t.chunk.isFrontMatter);
  let done = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const vectors = await embedPassages(slice.map((t) => t.chunk.text));
    db.transaction(() => {
      slice.forEach((t, j) => insertVec.run(vecKey(t.id), vecBlob(vectors[j])));
    })();
    done += slice.length;
    process.stdout.write(`\r  embeddings ${done}/${targets.length}`);
  }
  process.stdout.write("\r\x1b[K");

  db.prepare("update works set chunk_count = ? where id = ?").run(
    chunks.length,
    work.id,
  );

  console.log(`  ✓ ${work.id} — ${targets.length} sökbara stycken`);
  return targets.length;
}

/**
 * Syncs metadata for works already in the database.
 *
 * Indexing skips finished works, so a new field in the manifest — the
 * genre, a corrected name form, an adjusted year — would otherwise never
 * reach the works indexed before the change. It's just an `update`; the
 * chunks and embeddings aren't touched, so it costs milliseconds and
 * saves a reindex that would cost hours.
 */
function syncMetadata(db: DB): void {
  const stmt = db.prepare(
    // `translator is not ?`, not `translator != ?`: the column is nullable,
    // and SQL's `!=` against NULL is NULL (neither true nor false), so a
    // translator added or removed in the manifest never tripped the
    // difference check and never synced — the only field of the nine with
    // that gap, since it's the only nullable one. `IS NOT` is SQLite's
    // NULL-safe equality test and catches both directions.
    `update works set title = ?, author = ?, translator = ?, year = ?, era = ?, genre = ?,
                      source = ?, source_id = ?, language = ?
      where id = ? and (title != ? or author != ? or translator is not ? or year != ?
                        or era != ? or genre != ? or source != ? or source_id != ?
                        or language != ?)`,
  );
  let changed = 0;
  db.transaction(() => {
    for (const w of CORPUS) {
      const info = stmt.run(
        w.title,
        w.author,
        w.translator ?? null,
        w.year,
        w.era,
        w.genre,
        w.source,
        w.sourceId,
        w.language,
        w.id,
        w.title,
        w.author,
        w.translator ?? null,
        w.year,
        w.era,
        w.genre,
        w.source,
        w.sourceId,
        w.language,
      );
      changed += info.changes;
    }
  })();
  if (changed > 0)
    console.log(`Uppdaterade metadata för ${changed} redan indexerade verk.\n`);
}

async function main() {
  const { only, source, force, limit } = parseArgs();
  let works = only ? CORPUS.filter((w) => only.includes(w.sourceId)) : CORPUS;
  if (source) works = works.filter((w) => w.source === source);
  if (limit !== undefined && Number.isFinite(limit))
    works = works.slice(0, limit);

  // The metadata sync runs before the selection check: `pnpm ingest
  // --limit=0` should work for just rewriting metadata after a `pnpm build-corpus`.
  const db = getDb();
  syncMetadata(db);

  if (works.length === 0) {
    console.log("Inga verk matchade urvalet — inget att indexera.");
    return;
  }

  console.log(`Indexerar ${works.length} verk${force ? " (--force)" : ""}\n`);
  const started = Date.now();
  const failures: string[] = [];

  let embedded = 0;

  for (const [i, work] of works.entries()) {
    // The run takes hours for the full collection — show how much is left.
    const elapsed = (Date.now() - started) / 1000;
    const eta =
      embedded > 200 && i > 0
        ? `  ~${(((elapsed / i) * (works.length - i)) / 60).toFixed(0)} min kvar`
        : "";
    console.log(
      `[${i + 1}/${works.length}]${eta}  ${work.author} — ${work.title}` +
        `  (${SOURCE_LABEL[work.source]})`,
    );
    try {
      embedded += await ingestWork(db, work, force);
    } catch (err) {
      // A broken work must not bring down the whole run — report at the end.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${work.id}: ${msg}`);
      failures.push(`${work.id}: ${msg}`);
    }
  }

  const { chunks } = db
    .prepare("select count(*) as chunks from chunks")
    .get() as { chunks: number };
  const { vecs } = db
    .prepare("select count(*) as vecs from vec_chunks")
    .get() as { vecs: number };
  console.log(
    `\nKlart på ${((Date.now() - started) / 1000 / 60).toFixed(1)} min — ` +
      `${chunks} stycken, ${vecs} vektorer.`,
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} verk misslyckades:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
