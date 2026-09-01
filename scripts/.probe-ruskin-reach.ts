/**
 * Step 2: is it the collection that lacks the answer, or the chain that loses it?
 *
 * Step 1 (`.probe-ruskin.ts`) showed Ruskin REACHES the fusion — eight passages in
 * the treatise branch's top hundred — but that the cross-encoder gives his closest
 * passages 0.001–0.062. The question here is what the highest achievable number is:
 * is there, somewhere among Ruskin's 6,436 indexed passages, a passage that answers, and
 * what does reranking give it?
 *
 * The control is the three places where Ruskin actually says this — Seven Lamps,
 * Stones of Venice II, and St Mark's Rest. They're hand-transcribed here and are
 * NOT in the collection; the point is precisely to see what reranking would have given them.
 */
import { getDb } from "../src/lib/db";
import { scorePairs } from "../src/lib/rerank";

const QUESTION =
  "arkitektur säger sanningen om en civilisation mer än vad den säger om sig själv";
const QUERY_EN =
  "architecture tells the truth about a civilisation more than what it says about itself";

const db = getDb();

/* ------------------------------------------------------------------ *
 * 1. Best achievable Ruskin passage from the collection, via BM25 instead of vector
 * ------------------------------------------------------------------ */

// Lexical selection, not vector: the vector already had its say in step 1. Here the
// passages that literally deal with building and nation are searched, to see if any
// of them is the answering passage the vector missed.
const rows = db
  .prepare(
    `select c.id, c.text, c.locator, w.title
       from chunks_fts f
       join chunks c on c.id = f.rowid
       join works w on w.id = c.work_id
      where chunks_fts match ? and c.is_front_matter = 0 and w.author like '%Ruskin%'
      order by bm25(chunks_fts) limit 40`,
  )
  .all(
    '("architecture" OR "building" OR "buildings" OR "stones") AND ' +
      '("nation" OR "nations" OR "national" OR "civilisation" OR "civilization" OR "people")',
  ) as { id: number; text: string; locator: string | null; title: string }[];

console.log(`Ruskinstycken ur BM25 (arkitektur ∧ nation): ${rows.length}`);

const scores = await scorePairs(
  rows.map((r) => ({ query: QUESTION, passage: r.text })),
);
const scoresEn = await scorePairs(
  rows.map((r) => ({ query: QUERY_EN, passage: r.text })),
);
const ranked = rows
  .map((r, i) => ({ ...r, sv: scores[i], en: scoresEn[i] }))
  .sort((a, b) => b.en - a.en);

console.log(
  `\nBÄSTA UPPNÅELIGA UR samlingen (sorterat på engelsk cross-poäng)`,
);
for (const r of ranked.slice(0, 8)) {
  console.log(
    `  sv=${r.sv.toFixed(3)} en=${r.en.toFixed(3)}  ${r.title.slice(0, 40).padEnd(40)} ` +
      `${r.text.replace(/\s+/g, " ").slice(0, 110)}`,
  );
}

/* ------------------------------------------------------------------ *
 * 2. The control: the three passages that actually answer, and are not in the collection
 * ------------------------------------------------------------------ */

const MISSING: { where: string; text: string }[] = [
  {
    where: "St Mark's Rest, förordet (saknas i samlingen)",
    text: "Great nations write their autobiographies in three manuscripts,--the book of their deeds, the book of their words, and the book of their art. Not one of these books can be understood unless we read the two others; but of the three the only trustworthy one is the last. The acts of a nation may be triumphant by its good fortune; and its words mighty by the genius of a few of its children: but its art, only by the general gifts and common sympathies of the race.",
  },
  {
    where: "Seven Lamps of Architecture, Lamp of Memory (saknas i samlingen)",
    text: "How cold is all history, how lifeless all imagery, compared to that which the living nation writes, and the uncorrupted marble bears! How many pages of doubtful record might we not often spare, for a few stones left one upon another! The ambition of the old Babel builders was well directed for this world: there are but two strong conquerors of the forgetfulness of men, Poetry and Architecture; and the latter in some sort includes the former, and is mightier in its reality.",
  },
  {
    where: "Stones of Venice II, Nature of Gothic (saknas i samlingen)",
    text: "I believe the right question to ask, respecting all ornament, is simply this: Was it done with enjoyment--was the carver happy while he was about it? It may be the hardest work possible, and the harder because so much pleasure was taken in it; but it must have been happy too, or it will not be living. And so in the buildings of a nation you may read whether its workmen were free men or slaves, and whether its religion was a living faith or a form.",
  },
];

const missScoresSv = await scorePairs(
  MISSING.map((m) => ({ query: QUESTION, passage: m.text })),
);
const missScoresEn = await scorePairs(
  MISSING.map((m) => ({ query: QUERY_EN, passage: m.text })),
);
console.log(`\nKONTROLL — stycken som svarar men inte finns indexerade`);
for (let i = 0; i < MISSING.length; i++) {
  console.log(
    `  sv=${missScoresSv[i].toFixed(3)} en=${missScoresEn[i].toFixed(3)}  ${MISSING[i].where}`,
  );
}

/* ------------------------------------------------------------------ *
 * 3. Where a winning passage typically lands — a reference from another query
 * ------------------------------------------------------------------ */

// The README's Tylor passage scored 0.685 for "does progress happen in history". Without a
// reference here the numbers above can't be judged: 0.3 could be high or low.
const reference = await scorePairs([
  {
    query: QUESTION,
    passage:
      "Byggnadskonsten är det säkraste vittnesmålet om ett folks inre tillstånd. Vad en tid säger om sig själv i sina lagar och predikningar kan ljuga; dess murar och valv kan det inte, ty de byggdes av hela folket och inte av dess talesmän.",
  },
]);
console.log(
  `\n  referens: ett stycke som svarar rakt på frågan ger ${reference[0].toFixed(3)}`,
);
