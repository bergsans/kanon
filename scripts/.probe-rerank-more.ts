/**
 * Which MORE languages can the cross-encoder handle?
 *
 *   pnpm tsx scripts/.probe-rerank-more.ts
 *
 * The same measurement that settled German and French, extended to the languages
 * that could become the collection's next: Italian, Spanish, Norwegian, and Latin. The
 * measure is the overlap and Spearman between the same candidates ranked with the
 * Swedish query versus the query in the passage's own language — see `.probe-rerank-native.ts`
 * for the comparison figures (en 5.8/10 and 0.715, de 6.1 and 0.663, fr 5.3 and 0.594).
 *
 * The four are chosen because they cover three different kinds of risk:
 *
 *   Italian, Spanish    are in mMARCO, which the model is trained on — should hold up
 *   Norwegian           is NOT, but sits close to Swedish. Swedish isn't in mMARCO
 *                        either and still holds 8/10, so the model
 *                        generalizes; the question is how far.
 *   Latin                is neither in mMARCO nor close to anything that is. This is
 *                        the only one of the four where a no would be expected.
 *
 * AGREEMENT ISN'T ENOUGH AS A MEASURE, and that's why the score spread is included.
 * Overlap and Spearman measure whether the two rankings resemble each other — not whether
 * the model understands the language. A model that scores everything nearly the same can
 * be perfectly consistent in its indifference and get a high Spearman on pure
 * length- and punctuation-noise. That's exactly how the bge model failed in
 * `.probe-rerank.ts`: "all scores land below 0.002 and the ranking becomes noise".
 *
 * That's why the highest score and the spread are printed for the SWEDISH query, which is
 * what the app actually runs on. If they're on par with English's, the model
 * distinguishes the passages; if they're bunched near zero, the agreement is worthless no
 * matter how high it looks.
 *
 * RESULT (four queries, forty candidates per work, pair against pair):
 *
 *   pair        lang   top-10    ρ       spread  English control
 *   Dante       it     6.5/10    0.713   0.108   0.074
 *   Quijote     es     6.5/10    0.748   0.049   0.111
 *   Ibsen       no     7.0/10    0.901   0.143   0.022
 *   Descartes   la     7.0/10    0.841   0.099   0.133
 *
 * Italian and Latin sit in English's range. Spanish doesn't:
 * less than half of English's spread on *the same work and the same queries*, despite
 * higher rank agreement — precisely the combination that reveals a model that's
 * consistently indifferent rather than accurate.
 *
 * Norwegian looks best of all but the pair is unreliable: the English control
 * fell to 0.022, lower than anything else in the table, which means those particular
 * passages from *A Doll's House* don't answer the queries. The difference then measures
 * the selection, not the language. Norwegian sits closest to Swedish of all the
 * candidates and is probably the safest choice, but this measurement doesn't show it.
 *
 * The texts are real and fetched from Gutenberg. The model runs locally — no Claude,
 * no tokens.
 */
import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
} from "@huggingface/transformers";
import { chunkText } from "../src/lib/chunk";
import { fetchWorkText } from "../src/lib/sources";
import { MODEL_ID } from "../src/lib/rerank";
import type { CanonWork } from "../src/lib/corpus";

const QUESTIONS: Record<string, string>[] = [
  {
    sv: "Vad är det goda livet?",
    en: "What is the good life?",
    it: "Che cos'è la vita buona?",
    es: "¿Qué es la vida buena?",
    no: "Hva er det gode liv?",
    la: "Quid est vita bona?",
  },
  {
    sv: "Vad driver människan att söka makt?",
    en: "What drives a person to seek power?",
    it: "Che cosa spinge l'uomo a cercare il potere?",
    es: "¿Qué impulsa al hombre a buscar el poder?",
    no: "Hva driver mennesket til å søke makt?",
    la: "Quid hominem ad potentiam quaerendam impellit?",
  },
  {
    sv: "Vad händer med själen efter döden?",
    en: "What happens to the soul after death?",
    it: "Che cosa accade all'anima dopo la morte?",
    es: "¿Qué le sucede al alma después de la muerte?",
    no: "Hva skjer med sjelen etter døden?",
    la: "Quid animae post mortem accidit?",
  },
  {
    sv: "Kan vi veta något med säkerhet?",
    en: "Can we know anything with certainty?",
    it: "Possiamo sapere qualcosa con certezza?",
    es: "¿Podemos saber algo con certeza?",
    no: "Kan vi vite noe med sikkerhet?",
    la: "Possumusne aliquid certo scire?",
  },
];

/**
 * Four works, each in its own language AND in English.
 *
 * The pairing is what makes the score spread legible. The score doesn't depend only
 * on the language but on whether those particular passages answer the query, and
 * measuring each language on its own work would make the magnitudes incomparable:
 * Descartes's *Meditationes* answers "can we know anything with certainty",
 * *Don Quixote* doesn't. With the same work in two language guises, the content is
 * constant and the difference is the language.
 *
 * `pair` links the rows together; the English row in each pair is the control.
 */
const WORKS: { lang: string; id: string; label: string; pair: string }[] = [
  {
    pair: "Dante",
    lang: "it",
    id: "1000",
    label: "it  Dante, Divina Commedia",
  },
  {
    pair: "Dante",
    lang: "en",
    id: "1001",
    label: "en  Dante, Divine Comedy (Longfellow)",
  },
  {
    pair: "Quijote",
    lang: "es",
    id: "2000",
    label: "es  Cervantes, Don Quijote",
  },
  {
    pair: "Quijote",
    lang: "en",
    id: "996",
    label: "en  Cervantes, Don Quixote",
  },
  { pair: "Ibsen", lang: "no", id: "2544", label: "no  Ibsen, Et dukkehjem" },
  {
    pair: "Ibsen",
    lang: "en",
    id: "15492",
    label: "en  Ibsen, A Doll's House",
  },
  {
    pair: "Descartes",
    lang: "la",
    id: "23306",
    label: "la  Descartes, Meditationes",
  },
  {
    pair: "Descartes",
    lang: "en",
    id: "70091",
    label: "en  Descartes, Six Metaphysical Meditations",
  },
];

const CANDIDATES = 40;

const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
const model = await AutoModelForSequenceClassification.from_pretrained(
  MODEL_ID,
  { dtype: "fp32" },
);

async function score(query: string, texts: string[]): Promise<number[]> {
  const out: number[] = [];
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
    out.push(...(logits.sigmoid().tolist() as number[][]).map((x) => x[0]));
  }
  return out;
}

const order = (s: number[]) =>
  s
    .map((v, i) => ({ i, v }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.i);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const byLang = new Map<
  string,
  { overlap: number[]; rho: number[]; spread: number[]; top: number[] }
>();

console.log(`modell: ${MODEL_ID}\n`);

for (const entry of WORKS) {
  const work = {
    id: entry.id,
    source: "gutenberg",
    sourceId: entry.id,
    language: "en",
    titleMatch: "",
    authorMatch: "",
  } as CanonWork;

  let text: string;
  try {
    text = await fetchWorkText(work);
  } catch (err) {
    console.log(
      `${entry.label} — kunde inte hämtas: ${(err as Error).message.slice(0, 60)}`,
    );
    continue;
  }

  // Chunked with the English rules: heading detection only affects which
  // passages become candidates, not what's measured.
  const chunks = chunkText(text, "en").filter((c) => !c.isFrontMatter);
  const middle = Math.floor(chunks.length / 2);
  const sample = chunks
    .slice(Math.max(middle - CANDIDATES, 0), middle + CANDIDATES)
    .filter((c) => c.text.length > 400)
    .slice(0, CANDIDATES)
    .map((c) => c.text);

  if (sample.length < 10) {
    console.log(`${entry.label} — för få stycken`);
    continue;
  }

  const overlaps: number[] = [];
  const rhos: number[] = [];
  const spreads: number[] = [];
  const tops: number[] = [];
  for (const q of QUESTIONS) {
    // The scores from the SWEDISH query are what the app actually runs on, so it's
    // their spread that says whether the model distinguishes the passages or not.
    const svScores = await score(q.sv, sample);
    const sv = order(svScores);
    const own = order(await score(q[entry.lang], sample));
    const topSv = new Set(sv.slice(0, 10));
    overlaps.push(own.slice(0, 10).filter((i) => topSv.has(i)).length);
    const pos = new Map(own.map((id, r) => [id, r]));
    const n = sample.length;
    rhos.push(
      1 -
        (6 * sv.reduce((s, id, r) => s + (r - pos.get(id)!) ** 2, 0)) /
          (n * (n * n - 1)),
    );
    tops.push(Math.max(...svScores));
    spreads.push(Math.max(...svScores) - Math.min(...svScores));
  }

  console.log(
    `${entry.label.padEnd(34)} ${String(sample.length).padStart(3)} kand.  ` +
      `topp-10 ${mean(overlaps).toFixed(1)}/10   ρ ${mean(rhos).toFixed(3)}   ` +
      `högsta ${mean(tops).toFixed(3)}  spann ${mean(spreads).toFixed(3)}`,
  );

  const b = byLang.get(entry.lang) ?? {
    overlap: [],
    rho: [],
    spread: [],
    top: [],
  };
  b.overlap.push(...overlaps);
  b.rho.push(...rhos);
  b.spread.push(...spreads);
  b.top.push(...tops);
  byLang.set(entry.lang, b);
}

console.log(`\n${"─".repeat(58)}\nper språk:`);
for (const [lang, b] of byLang) {
  console.log(
    `  ${lang}   topp-10 ${mean(b.overlap).toFixed(1)}/10   Spearman ${mean(b.rho).toFixed(3)}` +
      `   högsta poäng ${mean(b.top).toFixed(3)}   spann ${mean(b.spread).toFixed(3)}`,
  );
}
console.log(
  `\nJämförelse ur .probe-rerank-native.ts (inhemsk prosa, olika verk):\n` +
    `  en 5,8/10 ρ 0,715 spann 0,139 · de 6,1/10 ρ 0,663 spann 0,161 ·\n` +
    `  fr 5,3/10 ρ 0,594 spann 0,158\n\n` +
    `Läs paren ovan mot varandra, inte tabellen per språk: den engelska raden i\n` +
    `varje par är samma verk och samma frågor, så skillnaden i spann är språket.`,
);
