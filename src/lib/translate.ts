/**
 * Machine translation of a single passage into Swedish.
 *
 * Nine out of ten works in the collection are English — originals or
 * 19th-century translations — and someone searching in Swedish gets an
 * answer in English. The rationale next to the quotation is in Swedish, but
 * the quotation itself is not, and for Hobbes or Gibbon in period English
 * it's often the quotation that's the hard part.
 *
 * The translation is done on request, one passage at a time, and saved. It's
 * expensive to redo and cheap to shelve: the same passage comes back the next
 * time a search hits it, via the cache or the permalink.
 *
 * It's explicitly a study aid, not an edition — the UI says so outright below
 * the text. The original stays one click away.
 */
import { getDb } from "./db";
import { textHash } from "./hash";
import {
  cachedSystem,
  completeText,
  effort,
  getClient,
  logUsage,
  MODEL,
} from "./claude";
import type { CostStep } from "./protocol";
import type { Language } from "./taxonomy";

const TRANSLATE_SYSTEM = `Du översätter enskilda stycken ur västerlandets kanon till svenska.
Texterna är original och 1800-talsöversättningar: filosofi, historia, drama, epos, dikt,
prosa och religiösa skrifter.

Regler:

1. Översätt HELA stycket. Sammanfatta inte, förkorta inte, förklara inte. Utelämna ingen
   mening — inte heller en som verkar avbruten. Stycken är utklippta ur en löpande text
   och kan börja mitt i en mening och sluta mitt i en annan: översätt dem ändå som de är,
   med samma ofullständiga början och slut. Lägg inte till ord för att laga fogen.

2. Radbrytningar. Är stycket VERS eller DRAMATIK — epos, dikt, strofer, repliker på vers —
   är brytningarna en del av texten: behåll dem rad för rad, en översatt rad per originalrad,
   och behåll strofmellanrummen. Bryt aldrig om vers till löpande prosa.
   Är stycket LÖPANDE PROSA är radbrytningarna mitt i meningarna bara utgåvans radbredd och
   ingenting annat: skriv då prosan som sammanhängande stycken utan de brytningarna, men
   behåll de tomma raderna mellan styckena.

3. Håll originalets register och tonläge. En period av Gibbon ska låta som en period, inte
   som en sammanfattning av en; en replik ur en tragedi ska gå att säga högt. Skriv en
   svenska som bär samma tyngd — hellre något högre stämd än modernt vardaglig — men den
   ska vara läsbar nu, inte en pastisch på 1800-talssvenska.

4. Översätt begrepp så som de heter på svenska i den filosofiska traditionen, inte ord för
   ord: "the commonwealth" är staten eller samväldet, "virtue" är dygd, "the multitude" är
   mängden. Är ett ord ett fackbegrepp som saknar svensk motsvarighet, behåll det och sätt
   originalordet inom parentes efter första förekomsten.

5. Egennamn får sin vedertagna svenska form när en sådan finns ("Athens" → Athen,
   "Aristotle" → Aristoteles), annars står de kvar.

6. Skriv ingen inledning, ingen kommentar och inga fotnoter. Fältet ska innehålla
   översättningen och ingenting annat.

Meddelandet du får har två delar. <verk> säger var stycket kommer ifrån och är BARA
sammanhang åt dig — översätt inte den raden och upprepa den inte i svaret. Det som ska
översättas är innehållet i <stycke>, från första tecknet till det sista.`;

const TRANSLATION_SCHEMA = {
  type: "object" as const,
  properties: {
    translation: { type: "string" as const },
  },
  required: ["translation"],
  additionalProperties: false,
};

/** The breakdown from the database. Broken or missing JSON must not sink the text. */
function parseSteps(raw: string | null): CostStep[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CostStep[]) : [];
  } catch {
    return [];
  }
}

interface ChunkRow {
  text: string;
  language: Language;
  author: string;
  title: string;
  locator: string | null;
}

export interface Translation {
  text: string;
  /** Did it come from the table instead of from Claude? Then it cost nothing. */
  cached: boolean;
  /**
   * Which model produced it — read back from the row for a cached hit, not
   * assumed to be today's `MODEL`. `CANON_MODEL` can change between when a
   * translation was made and when it's served from the cache, and the cost
   * breakdown attached to it (`steps`, from that same row) is only correct
   * read against the model that actually ran.
   */
  model: string;
  /** What the translation cost when it was made, in dollars. */
  cost: number;
  /**
   * The call behind the cost, line by line. Empty for a translation saved
   * before the breakdown existed — the total in `cost` remains and is still true.
   */
  steps: CostStep[];
}

/** The passage exists, but is already Swedish — nothing to translate. */
export class AlreadySwedishError extends Error {
  constructor() {
    super("Stycket är redan på svenska.");
  }
}

/**
 * Translates a passage into Swedish, or returns the saved translation.
 * `null` if the chunk ID doesn't exist.
 */
export async function translateChunk(
  chunkId: number,
): Promise<Translation | null> {
  const db = getDb();

  const chunk = db
    .prepare(
      `select c.text, c.locator, w.language, w.author, w.title
         from chunks c join works w on w.id = c.work_id
        where c.id = ?`,
    )
    .get(chunkId) as ChunkRow | undefined;
  if (!chunk) return null;
  if (chunk.language === "sv") throw new AlreadySwedishError();

  const fingerprint = textHash(chunk.text);

  const saved = db
    .prepare(
      `select text, model, cost, cost_detail from translations
        where chunk_id = ? and text_hash = ?`,
    )
    .get(chunkId, fingerprint) as
    | { text: string; model: string; cost: number; cost_detail: string | null }
    | undefined;
  if (saved) {
    return {
      text: saved.text,
      cached: true,
      // A row from before this column was read back (it was always written,
      // just never selected) has `model` as whatever the column's default
      // is — falling back to today's `MODEL` there is the closest available
      // truth, same reasoning as `parseSteps` falling back to an empty list.
      model: saved.model || MODEL,
      cost: saved.cost,
      steps: parseSteps(saved.cost_detail),
    };
  }

  const res = await getClient().messages.create({
    model: MODEL,
    // Swedish comes out longer than English, and thinking is billed from the
    // same budget. A truncated response is invalid JSON; `completeText`
    // turns it into an error the reader can act on, but it's still a failure.
    max_tokens: 4000,
    output_config: {
      // Low effort on purpose. The task is bounded and the prompt states what
      // should happen — the thinking budget goes onto the output bill without
      // making the Swedish any better. Raise to "medium" here if the verse
      // translations start to falter.
      ...effort("low"),
      format: { type: "json_schema", schema: TRANSLATION_SCHEMA },
    },
    system: cachedSystem(TRANSLATE_SYSTEM),
    messages: [
      {
        role: "user",
        // Work and location are included: the same word means different
        // things in Hobbes and in Homer, and the model translates better
        // knowing where it stands.
        //
        // The tags are not decoration. Without them the model put the work
        // line at the top of the translation and made the bibliographic
        // reference part of the text — passages often begin mid-sentence,
        // and then a heading line above looks like the passage's own start.
        content:
          `<verk>${chunk.author}, ${chunk.title}${chunk.locator ? `, ${chunk.locator}` : ""}</verk>\n` +
          `<stycke>\n${chunk.text}\n</stycke>`,
      },
    ],
  });
  const usage = logUsage("översättning", res.usage);

  const translation = (JSON.parse(completeText(res)) as { translation?: unknown })
    .translation;
  if (typeof translation !== "string" || !translation.trim()) {
    throw new Error("Claude gav ingen översättning tillbaka.");
  }

  // `replace`, not `insert`: an old translation of text that's since been
  // re-indexed still sits on the same chunk ID and should be overwritten.
  db.prepare(
    `replace into translations (chunk_id, text_hash, text, model, cost, cost_detail, created_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    chunkId,
    fingerprint,
    translation,
    MODEL,
    usage.cost,
    JSON.stringify([usage]),
    new Date().toISOString(),
  );

  return {
    text: translation,
    cached: false,
    model: MODEL,
    cost: usage.cost,
    steps: [usage],
  };
}
