/**
 * Why Ruskin is absent for "architecture tells the truth about a civilisation more than
 * what it says about itself".
 *
 * The query is the most Ruskinian one that can be asked — *The Seven Lamps* and *Stones
 * of Venice* say almost exactly this — and the collection has 24 Ruskin works with
 * 6,436 embedded passages. If he's still absent, it's not the collection that's
 * lacking but a step in the chain that loses him, and this measurement says which.
 *
 * No Claude: the nine hypothetical passages are hand-written in the same registers
 * expansion uses. That makes the measurement free and repeatable, but it measures
 * an approximation of the branches — not the run the user saw.
 *
 * Run: pnpm tsx scripts/.probe-ruskin.ts
 */
import { getDb, vecBlob } from "../src/lib/db";
import { embedQuery } from "../src/lib/embed";
import { scorePairs } from "../src/lib/rerank";

const QUESTION =
  "arkitektur säger sanningen om en civilisation mer än vad den säger om sig själv";
const QUERY_EN =
  "architecture tells the truth about a civilisation more than what it says about itself";

/** Four English registers plus one passage per other collection language — as in claude.ts. */
const PASSAGES: { label: string; text: string }[] = [
  {
    label: "en/traktat",
    text: "Great nations write their autobiographies in three manuscripts: the book of their deeds, the book of their words, and the book of their art. Not one of these books can be understood unless we read the two others; but of the three the only trustworthy one is the last. The acts of a nation may be triumphant by its good fortune, and its words mighty by the genius of a few of its children; but its art only by the general gifts and common sympathies of the race. Its deeds and its words may be lies, but the stone it lays one upon another cannot lie.",
  },
  {
    label: "en/historia",
    text: "The traveller who enters the city by water sees first the palaces of the merchants, and reads in the change of their mouldings the whole history of the republic: the frank strength of the earlier centuries, the rich confidence of the age of conquest, and at last the weak and ostentatious ornament of the years of decline. The chronicles of the state praise its virtue to the end; the carved capitals of its houses record the corruption of its faith long before any chronicler dared name it.",
  },
  {
    label: "en/gestaltad",
    text: "Stand here, and look at the wall before you. The builder is dead these five hundred years, and no word of his survives; yet the labour of his hand tells you whether he was a free man or a slave, whether he loved his work or feared his master, whether his city honoured God or itself. A building is a confession made by a whole people without knowing that it confesses.",
  },
  {
    label: "en/system",
    text: "In every epoch the spirit of a people objectifies itself first in stone, and only afterwards attains consciousness of itself in religion, in law, and in philosophy. Architecture is therefore the earliest and the least dissembling of the arts: the temple, the cathedral, the factory each embody the ruling idea of their age with a fidelity which the age's own account of itself never possesses, for a people may deceive itself in its doctrines but not in its dwellings.",
  },
  {
    label: "sv",
    text: "En byggnad ljuger inte. Ett folks lagar och predikningar säger vad det vill vara; dess murar, portar och kyrkor säger vad det verkligen var. Därför är byggnadskonsten den säkraste källan vi har till en civilisations inre tillstånd, och den vittnar om förfallet långt innan någon krönikör vågar skriva ordet.",
  },
  {
    label: "de",
    text: "Die Baukunst ist die erste und ehrlichste Selbstdarstellung eines Volkes. Was ein Zeitalter von sich selbst behauptet, steht in seinen Büchern; was es wirklich war, steht in seinen Mauern, Gewölben und Türmen. Der Geist einer Kultur wird im Stein sichtbar, ehe er sich in Begriffen begreift.",
  },
  {
    label: "fr",
    text: "L'architecture est le grand livre de l'humanité. Ce qu'un peuple dit de lui-même dans ses lois et ses chroniques peut mentir; ce qu'il bâtit ne ment jamais. La pierre garde la trace exacte de la foi, de la richesse et de la corruption d'une civilisation, et la ruine en dit plus long que toute histoire écrite.",
  },
  {
    label: "it",
    text: "L'architettura è la testimonianza più veritiera di una civiltà. Le cronache di una repubblica ne lodano la virtù fino all'ultimo giorno; i capitelli e le facciate dei suoi palazzi registrano invece la decadenza della sua fede molto prima che qualcuno osi nominarla.",
  },
  {
    label: "la",
    text: "Aedificia populi mores verius produnt quam verba. Quae de se ipsa civitas praedicat in legibus et annalibus scripta sunt; quae vere fuit, in muris, templis et arcubus manet. Lapis enim mentiri nescit, et ruina plus de imperio narrat quam historia.",
  },
];

const BRANCH_LIMIT = 100;
const RERANK_POOL = 96;

const db = getDb();

const ruskinChunks = db
  .prepare(
    `select c.id as id, w.title as title
       from chunks c join works w on w.id = c.work_id
      where w.author like '%Ruskin%' and c.is_front_matter = 0`,
  )
  .all() as { id: number; title: string }[];
const ruskinIds = new Set(ruskinChunks.map((r) => r.id));
const titleOf = new Map(ruskinChunks.map((r) => [r.id, r.title]));
console.log(`Ruskinstycken i indexet: ${ruskinIds.size}\n`);

/* ------------------------------------------------------------------ *
 * 1. Where in each branch does the nearest Ruskin passage sit?
 * ------------------------------------------------------------------ */

const knn = db.prepare(
  `select chunk_id as chunkId, distance from vec_chunks
    where embedding match ? and k = ? order by distance`,
);
const exact = db.prepare(
  `select chunk_id as chunkId, vec_distance_cosine(embedding, ?) as d
     from vec_chunks where chunk_id in (${[...ruskinIds].map(() => "?").join(",")})
    order by d limit 3`,
);

console.log(
  "GREN                 topp-100   plats i k=4096   bästa Ruskinstycke",
);
const embeddings: Float32Array[] = [];
for (const p of PASSAGES) {
  const v = await embedQuery(p.text);
  embeddings.push(v);
  const blob = vecBlob(v);

  const top100 = (knn.all(blob, BRANCH_LIMIT) as { chunkId: number }[]).filter(
    (r) => ruskinIds.has(r.chunkId),
  ).length;

  const deep = knn.all(blob, 4096) as { chunkId: number; distance: number }[];
  const at = deep.findIndex((r) => ruskinIds.has(r.chunkId));

  const best = (
    exact.all(blob, ...ruskinIds) as { chunkId: number; d: number }[]
  )[0];
  const cut = deep[BRANCH_LIMIT - 1]?.distance ?? 0;
  console.log(
    `${p.label.padEnd(20)} ${String(top100).padStart(8)}   ` +
      `${(at === -1 ? ">4096" : String(at + 1)).padStart(14)}   ` +
      `d=${best.d.toFixed(3)} (grenens 100:e: ${cut.toFixed(3)}) ` +
      `${titleOf.get(best.chunkId)?.slice(0, 40)}`,
  );
}

/* ------------------------------------------------------------------ *
 * 2. What DO the best Ruskin passages say, and what does the cross-encoder give them?
 * ------------------------------------------------------------------ */

// The smallest distance to any of the nine branches — the same measure the mention branch uses.
const blobs = embeddings.map(vecBlob);
const columns = embeddings
  .map((_, i) => `vec_distance_cosine(embedding, ?) as d${i}`)
  .join(", ");
const scored = (
  db
    .prepare(
      `select chunk_id as chunkId, ${columns} from vec_chunks
        where chunk_id in (${[...ruskinIds].map(() => "?").join(",")})`,
    )
    .all(...blobs, ...ruskinIds) as Record<string, number>[]
).map((row) => {
  let best = Infinity;
  for (let i = 0; i < embeddings.length; i++)
    best = Math.min(best, row[`d${i}`]);
  return { chunkId: row.chunkId, d: best };
});
scored.sort((a, b) => a.d - b.d);

const top = scored.slice(0, 12);
const texts = db
  .prepare(
    `select c.id as id, c.text, c.locator, w.title
       from chunks c join works w on w.id = c.work_id
      where c.id in (${top.map(() => "?").join(",")})`,
  )
  .all(...top.map((t) => t.chunkId)) as {
  id: number;
  text: string;
  locator: string | null;
  title: string;
}[];
const byId = new Map(texts.map((t) => [t.id, t]));

const scores = await scorePairs(
  top.map((t) => ({ query: QUESTION, passage: byId.get(t.chunkId)!.text })),
);
const scoresEn = await scorePairs(
  top.map((t) => ({ query: QUERY_EN, passage: byId.get(t.chunkId)!.text })),
);

console.log(`\nRUSKINS TOLV NÄRMASTE STYCKEN (cross-encoder mot frågan)`);
for (let i = 0; i < top.length; i++) {
  const row = byId.get(top[i].chunkId)!;
  console.log(
    `  d=${top[i].d.toFixed(3)}  sv=${scores[i].toFixed(3)} en=${scoresEn[i].toFixed(3)}  ` +
      `${row.title.slice(0, 34).padEnd(34)} ${(row.locator ?? "").slice(0, 22).padEnd(22)} ` +
      `${row.text.replace(/\s+/g, " ").slice(0, 90)}`,
  );
}
