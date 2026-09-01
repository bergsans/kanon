import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";

const db = getDb();
const row = db
  .prepare("select text, locator from chunks where id = 293123")
  .get() as { text: string; locator: string };
console.log(`\n=== #293123 [${row.locator}]  ${row.text.length} tecken\n`);
console.log(row.text);

const KEYWORDS = [
  "progress",
  "march",
  "civilization",
  "decline",
  "fall",
  "manners",
  "rude",
  "nations",
  "barbarism",
  "Idea",
  "World-Spirit",
  "dialectic",
  "necessity",
  "relations",
  "production",
  "corruption",
  "luxury",
  "wheel",
  "fortune",
  "ages",
  "mankind",
  "improvement",
  "advance",
  "reason",
];
const low = row.text.toLowerCase();
console.log(
  `\nnyckelord som står i stycket: ${KEYWORDS.filter((k) => low.includes(k.toLowerCase())).join(", ") || "inga"}`,
);
console.log(
  `"spirit": ${low.includes("spirit")}   "mind": ${low.includes("mind")}   "progress": ${low.includes("progress")}`,
);

// The mention branch: same passage, but searched within Hegel's own works.
const HYDE =
  "It is the necessity of the Idea that it pass through its own negation and return to itself enriched, so that what seems the ruin of one age is but the labour-pain of the next; the World-Spirit does not repeat itself vainly, but climbs, by the very contradictions that appear as decline, toward its own perfect self-consciousness.";
const ids = db
  .prepare(
    "select c.id from chunks c join works w on w.id=c.work_id where w.author like '%Hegel%' and c.is_front_matter=0",
  )
  .all() as { id: number }[];
const blob = vecBlob(await embedQuery(HYDE));
const scored: { chunkId: number; d: number }[] = [];
for (let i = 0; i < ids.length; i += 5000) {
  const s = ids.slice(i, i + 5000);
  scored.push(
    ...(db
      .prepare(
        `select chunk_id as chunkId, vec_distance_cosine(embedding,?) as d from vec_chunks where chunk_id in (${s.map(() => "?").join(",")}) order by d limit 300`,
      )
      .all(blob, ...s.map((r) => r.id)) as { chunkId: number; d: number }[]),
  );
}
scored.sort((a, b) => a.d - b.d);
console.log(
  `\nmentiongrenen ("Hegel", ${ids.length} stycken): §548 plats ${scored.findIndex((r) => r.chunkId === 293123) + 1}`,
);
const meta = db.prepare(
  "select c.locator, substr(c.text,1,70) t from chunks c where c.id=?",
);
scored.slice(0, 5).forEach((r, i) => {
  const m = meta.get(r.chunkId) as { locator: string; t: string };
  console.log(`  ${i + 1}. [${m.locator}] ${m.t.replace(/\s+/g, " ")}…`);
});
