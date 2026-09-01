/**
 * Does the cross-encoder keep Swedish together with GERMAN and FRENCH, the way it does with English?
 *
 *   pnpm tsx scripts/.probe-rerank-lang.ts
 *
 * The question decides whether the collection can take in German and French source texts
 * at all. The chain cares about language in three places, and two of them are trivial —
 * the chunker's heading rules and the translate button. The third is this: a Swedish
 * query is scored against a passage in another language, and if the model doesn't keep
 * the languages together, the right passage never lands at the top.
 *
 * THE MEASURE IS THE REPO'S OWN. `.probe-rerank.ts` measured Swedish against English as
 * the overlap between the same candidates ranked with the Swedish query versus its English
 * equivalent, plus Spearman over the whole list. That gave 8/10 and 0.80 for the mmarco
 * model, and that's the figure the new languages should be compared against. Same method,
 * same model, same number of candidates — only the passages' language differs.
 *
 * THE TEXT IS REAL, not constructed. Perseus carries Thucydides in 19th-century German and
 * French translation alongside the English, so the material is the same work in four
 * language guises from a source already wired in. The query is chosen to fit the work: the
 * Melian dialogue is precisely about the right of the strong.
 *
 * The fetch goes to GitHub's CDN and the model runs locally. No Claude, no tokens.
 */
import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
} from "@huggingface/transformers";
import { chunkText } from "../src/lib/chunk";
import { fetchRaw, toText } from "../src/lib/perseus";
import { MODEL_ID } from "../src/lib/rerank";
import type { CanonWork } from "../src/lib/corpus";

/**
 * Four queries in four language guises.
 *
 * Four and not one: on forty candidates a single top-10 overlap is a coarse
 * measure, and the difference between 5/10 and 7/10 could be a single query
 * that happens to fall well. The average across four queries is what should decide.
 *
 * The queries are chosen to fit the work — the Melian dialogue, the causes of the
 * war, civil war's collapse at Corcyra, civic duty in Pericles's funeral oration.
 * A query Thucydides doesn't answer only measures noise.
 */
const QUESTIONS: Record<string, string>[] = [
  {
    sv: "Har den starke rätt att härska över den svage?",
    en: "Does the strong have the right to rule over the weak?",
    de: "Hat der Starke das Recht, über den Schwachen zu herrschen?",
    fr: "Le fort a-t-il le droit de dominer le faible ?",
  },
  {
    sv: "Vad driver stater till krig?",
    en: "What drives states to go to war?",
    de: "Was treibt Staaten in den Krieg?",
    fr: "Qu'est-ce qui pousse les États à la guerre ?",
  },
  {
    sv: "Hur bryter inbördeskriget ner en stad inifrån?",
    en: "How does civil war corrupt a city from within?",
    de: "Wie zersetzt der Bürgerkrieg eine Stadt von innen?",
    fr: "Comment la guerre civile corrompt-elle une cité de l'intérieur ?",
  },
  {
    sv: "Vad är medborgarens plikt mot sin stad?",
    en: "What is the citizen's duty towards his city?",
    de: "Was schuldet der Bürger seiner Stadt?",
    fr: "Quel est le devoir du citoyen envers sa cité ?",
  },
];

/** Thucydides in four editions. Same work, so the candidates are comparable. */
const EDITIONS: { lang: string; urn: string; note: string }[] = [
  {
    lang: "en",
    urn: "urn:cts:greekLit:tlg0003.tlg001.perseus-eng4",
    note: "Hobbes 1843",
  },
  {
    lang: "de",
    urn: "urn:cts:greekLit:tlg0003.tlg001.1st1K-ger2",
    note: "Wahrmund 1864",
  },
  {
    lang: "fr",
    urn: "urn:cts:greekLit:tlg0003.tlg001.1st1K-fre2",
    note: "Zévort 1852",
  },
];

/** The same number of candidates `.probe-rerank.ts` used, so the numbers are comparable. */
const CANDIDATES = 40;

const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
const model = await AutoModelForSequenceClassification.from_pretrained(
  MODEL_ID,
  {
    dtype: "fp32",
  },
);

async function rank(query: string, texts: string[]): Promise<number[]> {
  const scores: number[] = [];
  for (let i = 0; i < texts.length; i += 16) {
    const slice = texts.slice(i, i + 16);
    const inputs = await tokenizer(
      slice.map(() => query),
      {
        text_pair: slice.map((t) => t.slice(0, 1400)),
        padding: true,
        truncation: true,
      },
    );
    const { logits } = await model(inputs);
    scores.push(...(logits.sigmoid().tolist() as number[][]).map((x) => x[0]));
  }
  return scores;
}

const order = (scores: number[]) =>
  scores
    .map((s, i) => ({ i, s }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.i);

console.log(`modell: ${MODEL_ID}\n`);

for (const edition of EDITIONS) {
  const work = {
    id: edition.urn,
    sourceId: edition.urn,
    titleMatch: "",
    authorMatch: "",
  } as CanonWork;
  const text = toText(await fetchRaw(work), work);

  // The candidates are taken from the middle of the work, where the Melian dialogue and
  // the great speeches sit. A selection from the beginning would have given the preface
  // and the early chapters' background — the same passages in all three editions, but not
  // the ones the query is about.
  const chunks = chunkText(text, "en").filter((c) => !c.isFrontMatter);
  const middle = Math.floor(chunks.length / 2);
  const sample = chunks
    .slice(Math.max(middle - CANDIDATES, 0), middle + CANDIDATES)
    .filter((c) => c.text.length > 400)
    .slice(0, CANDIDATES)
    .map((c) => c.text);

  console.log(
    `${edition.lang}  ${edition.note}  —  ${sample.length} kandidater`,
  );
  if (sample.length < 10) {
    console.log("   för få stycken att mäta på\n");
    continue;
  }

  const overlaps: number[] = [];
  const rhos: number[] = [];

  for (const question of QUESTIONS) {
    // The Swedish query against the passage's own language. If the model keeps the
    // languages together, the two rankings should be nearly identical.
    const sv = order(await rank(question.sv, sample));
    const own = order(await rank(question[edition.lang], sample));

    const topSv = new Set(sv.slice(0, 10));
    const overlap = own.slice(0, 10).filter((i) => topSv.has(i)).length;

    const posOwn = new Map(own.map((id, rank) => [id, rank]));
    const n = sample.length;
    const d2 = sv.reduce((s, id, rank) => s + (rank - posOwn.get(id)!) ** 2, 0);
    const rho = 1 - (6 * d2) / (n * (n * n - 1));

    overlaps.push(overlap);
    rhos.push(rho);
    console.log(
      `   ${`${overlap}/10`.padStart(5)}  ρ ${rho.toFixed(3).padStart(6)}   ${question.sv}`,
    );
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(
    `   ${"snitt".padStart(5)}  ρ ${mean(rhos).toFixed(3).padStart(6)}   ` +
      `topp-10 ${mean(overlaps).toFixed(1)}/10\n`,
  );
}

console.log(
  `Jämför med repots mätning av svenska mot engelska i .probe-rerank.ts:\n` +
    `  8/10 i topp tio, Spearman 0,80. Den engelska raden ovan är samma mätning på\n` +
    `  det här materialet och är den rättvisa jämförelsepunkten — ligger tyska och\n` +
    `  franska i närheten håller modellen ihop språken och samlingen kan ta in dem.`,
);
