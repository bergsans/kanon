/**
 * The way out that already exists: if the query names names, the mention branch lights up.
 *
 * Every intervention in retrieval costs either latency or breadth. Before touching
 * the chain, it's worth asking whether the same passages can be reached with what's
 * already built — the mention branch is locked to the named works and free.
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";

const db = getDb();
const HYDE = "The history of the world is the progress of the consciousness of freedom, and this necessity we must comprehend. Spirit does not wander idly through time but returns upon itself; what appears as the ruin of empires is the labour of the Idea attaining a fuller determination of its own essence.";

const mentions = ["Hegel", "Schopenhauer", "Nietzsche", "Marx"];
const findWorks = db.prepare("select id from works where author like ? escape '\\' or title like ? escape '\\' limit 40");
const workIds = new Set<string>();
for (const m of mentions)
  for (const r of findWorks.all(`%${m}%`, `%${m}%`) as { id: string }[]) workIds.add(r.id);

const ids = db.prepare(
  `select id from chunks where work_id in (${[...workIds].map(() => "?").join(",")}) and is_front_matter = 0`,
).all(...workIds) as { id: number }[];

const blob = vecBlob(await embedQuery(HYDE));
const t0 = Date.now();
const scored: { chunkId: number; d: number }[] = [];
for (let i = 0; i < ids.length; i += 900) {
  const slice = ids.slice(i, i + 900);
  scored.push(...(db.prepare(
    `select chunk_id as chunkId, vec_distance_cosine(embedding, ?) as d from vec_chunks
      where chunk_id in (${slice.map(() => "?").join(",")}) order by d limit 100`,
  ).all(blob, ...slice.map((r) => r.id)) as { chunkId: number; d: number }[]));
}
const ms = Date.now() - t0;

const meta = db.prepare(
  "select w.author, w.title, c.locator, substr(c.text,1,90) as t from chunks c join works w on w.id=c.work_id where c.id=?",
);
console.log(`\nmentiongren över ${mentions.join(", ")}: ${ids.length.toLocaleString("sv-SE")} stycken på ${ms} ms\n`);
scored.sort((a, b) => a.d - b.d).slice(0, 12).forEach((r, i) => {
  const m = meta.get(r.chunkId) as { author: string; title: string; locator: string; t: string };
  console.log(`${String(i + 1).padStart(2)}. ${m.author} — ${m.title.slice(0, 40)} [${m.locator ?? "?"}]`);
  console.log(`    ${m.t.replace(/\s+/g, " ")}…`);
});
