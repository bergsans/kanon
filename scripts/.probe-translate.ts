/**
 * Does the translation keep the passage intact?
 *
 * Two things are measured, and both are regressions that have already happened once:
 *
 *   1. The work-title line shouldn't end up in the text. Without the <work>/<passage>
 *      tags, the model put "The Epic of Gilgamesh, An Old Babylonian Version…" at the
 *      top of the translation, and since passages often start mid-sentence, such a
 *      heading line looks like the passage's own beginning.
 *   2. Line breaks should follow the text's nature. Line-wrapped prose should flow
 *      together — the breaks are just the edition's line width, nothing else — while
 *      line- and stanza-structured text should keep its lines.
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/.probe-translate.ts
 * Costs a handful of cents. Deletes its own cache first, otherwise it measures nothing.
 */
import { getDb } from "../src/lib/db";
import { translateChunk } from "../src/lib/translate";

interface Row {
  id: number;
  author: string;
  title: string;
  text: string;
}

const db = getDb();

const lines = (s: string) => s.split("\n").length;
const avgLine = (s: string) => s.length / lines(s);

/** Line-wrapped prose: long passages, breaks only where the edition ran out of line width. */
const prose = db
  .prepare(
    `select c.id, w.author, w.title, c.text
       from chunks c join works w on w.id = c.work_id
      where w.language = 'en' and w.genre in ('filosofi', 'historia')
        and c.is_front_matter = 0 and length(c.text) between 800 and 1400
      order by c.id limit 1`,
  )
  .get() as Row;

/** Line-structured text: a line is a unit and should remain a line. */
const versed = (
  db
    .prepare(
      `select c.id, w.author, w.title, c.text
         from chunks c join works w on w.id = c.work_id
        where w.language = 'en' and w.genre in ('dikt', 'drama')
          and c.is_front_matter = 0 and length(c.text) between 600 and 1200
        order by c.id`,
    )
    .all() as Row[]
).filter((r) => avgLine(r.text) < 45)[0];

for (const [art, row] of [
  ["prosa", prose],
  ["radindelat", versed],
] as const) {
  if (!row) continue;
  db.prepare("delete from translations where chunk_id = ?").run(row.id);

  const t = await translateChunk(row.id);
  const out = t?.text ?? "";

  console.log(`\n===== ${art}: ${row.author}, ${row.title} (stycke ${row.id}) =====`);
  console.log(`rader: ${lines(row.text)} original → ${lines(out)} översatt`);
  console.log(`snittrad: ${avgLine(row.text).toFixed(0)} → ${avgLine(out).toFixed(0)} tecken`);

  // The work-title line in the translation is the error under (1). The surname is enough as a test.
  const surname = row.author.split(" ").pop() ?? row.author;
  const leak = out.slice(0, 120).includes(surname) && !row.text.slice(0, 120).includes(surname);
  console.log(leak ? "VARNING: verkraden läckte in i texten" : "verkraden höll sig utanför");

  console.log("--- original ---\n" + row.text.split("\n").slice(0, 6).join("\n"));
  console.log("--- översättning ---\n" + out.split("\n").slice(0, 6).join("\n"));
}
