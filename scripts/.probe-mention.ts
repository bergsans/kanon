/** How expensive does a brute-force vector search within a single author's works get? */
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { DB_PATH } from "../src/lib/db";

const db = new Database(DB_PATH, { readonly: true });
sqliteVec.load(db);

const q = (db.prepare("select embedding from vec_chunks limit 1").get() as { embedding: Buffer })
  .embedding;

for (const name of ["Plato", "Aristotle", "Edward Gibbon", "William Shakespeare"]) {
  const works = db
    .prepare("select id from works where author like ?")
    .all(`%${name}%`) as { id: string }[];
  if (works.length === 0) { console.log(`${name}: inga verk indexerade ännu`); continue; }

  const t0 = Date.now();
  const ids = db
    .prepare(
      `select c.id from chunks c where c.work_id in (${works.map(() => "?").join(",")}) and c.is_front_matter = 0`,
    )
    .all(...works.map((w) => w.id)) as { id: number }[];
  const t1 = Date.now();

  let rows: unknown[] = [];
  const BATCH = 5000;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    rows = rows.concat(
      db
        .prepare(
          `select chunk_id, vec_distance_cosine(embedding, ?) as d
             from vec_chunks where chunk_id in (${slice.map(() => "?").join(",")})
            order by d limit 100`,
        )
        .all(q, ...slice.map((r) => r.id)),
    );
  }
  console.log(
    `${name.padEnd(20)} ${works.length} verk, ${String(ids.length).padStart(5)} stycken — ` +
      `id-uppslag ${t1 - t0} ms, avstånd ${Date.now() - t1} ms`,
  );
}
