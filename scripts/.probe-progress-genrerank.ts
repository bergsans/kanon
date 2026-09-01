import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";

const db = getDb();
const HYDE: [string, string][] = [
  ["a (traktat)", "It is the part of the philosopher to inquire whether the successive ages of mankind exhibit a true advance, or whether the appearance of improvement be but a shifting of the same passions into new forms. If reason be the same in every age, and the ends of human action be fixed by nature, then what men call progress can be nothing more than the better ordering of unchanging materials; but if reason itself grow, then history is not a wheel but a ladder, and each generation stands upon the shoulders of the last."],
  ["d (systembygge)", "It is the necessity of the Idea that it pass through its own negation and return to itself enriched, so that what seems the ruin of one age is but the labour-pain of the next; the World-Spirit does not repeat itself vainly, but climbs, by the very contradictions that appear as decline, toward its own perfect self-consciousness. Even so the relations of production, having ripened within the old form until that form can contain them no longer, burst it asunder, and a new order arises of necessity, not by the will of man; and this ascent, though it wear the mask of catastrophe, is the sole and inexorable law of the whole historical process."],
];
const TARGET = 293123;

for (const genres of [["filosofi"], ["filosofi", "historia", "politik"]]) {
  const ids = db
    .prepare(
      `select c.id from chunks c join works w on w.id = c.work_id
        where w.genre in (${genres.map(() => "?").join(",")}) and c.is_front_matter = 0`,
    )
    .all(...genres) as { id: number }[];
  console.log(`\n=== genre ${genres.join("+")}: ${ids.length.toLocaleString("sv-SE")} stycken`);
  for (const [label, passage] of HYDE) {
    const blob = vecBlob(await embedQuery(passage));
    const t0 = Date.now();
    const scored: { chunkId: number; d: number }[] = [];
    for (let i = 0; i < ids.length; i += 5000) {
      const s = ids.slice(i, i + 5000);
      scored.push(
        ...(db
          .prepare(
            `select chunk_id as chunkId, vec_distance_cosine(embedding, ?) as d from vec_chunks
              where chunk_id in (${s.map(() => "?").join(",")}) order by d limit 300`,
          )
          .all(blob, ...s.map((r) => r.id)) as { chunkId: number; d: number }[]),
      );
    }
    scored.sort((a, b) => a.d - b.d);
    const at = scored.findIndex((r) => r.chunkId === TARGET) + 1;
    console.log(`  register ${label}: §548 plats ${at || "—"} av ${scored.length}  (${Date.now() - t0} ms)`);
  }
}
