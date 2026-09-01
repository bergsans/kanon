/**
 * Second measurement of the same question: does the cross-encoder keep Swedish together
 * with German and French when the text is written in the language, not translated into it?
 *
 *   pnpm tsx scripts/.probe-rerank-native.ts
 *
 * `.probe-rerank-lang.ts` measured on Thucydides in three language guises, which gave
 * comparable material but one weakness: all three were *translations from Greek*.
 * French fell there to 4.0/10 and Spearman 0.501 against English's 5.8 and 0.649,
 * and there was no way to tell whether it was French or Zévort's translator's prose
 * that was being measured. The distinction decides whether the collection can take in
 * French source texts, so it shouldn't rest on a single measurement.
 *
 * Here native prose is measured instead: Kant and Hegel in German from DTA, Tocqueville
 * and Montesquieu in French from Gutenberg, Hobbes and Locke in English as the
 * comparison point. Same method as before — the same candidates ranked with the
 * Swedish query versus the query in the passage's own language.
 *
 * The model runs locally. No Claude, no tokens.
 */
import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
} from "@huggingface/transformers";
import { chunkText } from "../src/lib/chunk";
import { fetchWorkText } from "../src/lib/sources";
import { MODEL_ID } from "../src/lib/rerank";
import type { CanonWork, Language } from "../src/lib/corpus";

/**
 * Four queries in four language guises, chosen to fit political and moral-philosophical
 * prose — the genre all six works below belong to.
 */
const QUESTIONS: Record<string, string>[] = [
  {
    sv: "Vad ger en stat rätt att härska över sina medborgare?",
    en: "What gives a state the right to rule over its citizens?",
    de: "Was gibt dem Staat das Recht, über seine Bürger zu herrschen?",
    fr: "Qu'est-ce qui donne à l'État le droit de gouverner ses citoyens ?",
  },
  {
    sv: "Kan frihet och jämlikhet förenas?",
    en: "Can liberty and equality be reconciled?",
    de: "Lassen sich Freiheit und Gleichheit vereinbaren?",
    fr: "La liberté et l'égalité peuvent-elles se concilier ?",
  },
  {
    sv: "Vad händer med människan när hon lyder utan att tänka?",
    en: "What becomes of a person who obeys without thinking?",
    de: "Was wird aus dem Menschen, der ohne zu denken gehorcht?",
    fr: "Que devient l'homme qui obéit sans penser ?",
  },
  {
    sv: "Var går gränsen för vad vi kan veta?",
    en: "Where lies the limit of what we can know?",
    de: "Wo liegt die Grenze dessen, was wir wissen können?",
    fr: "Où se situe la limite de ce que nous pouvons connaître ?",
  },
];

interface Work {
  lang: Language;
  label: string;
  work: CanonWork;
}

const g = (id: string, label: string): Work => ({
  lang: "en",
  label,
  work: {
    id,
    source: "gutenberg",
    sourceId: id,
    language: "en",
    titleMatch: "",
    authorMatch: "",
  } as CanonWork,
});
const fr = (id: string, label: string): Work => ({
  lang: "fr" as Language,
  label,
  work: {
    id,
    source: "gutenberg",
    sourceId: id,
    language: "en",
    titleMatch: "",
    authorMatch: "",
  } as CanonWork,
});
const de = (id: string, label: string): Work => ({
  lang: "de",
  label,
  work: {
    id,
    source: "dta",
    sourceId: id,
    language: "de",
    titleMatch: "",
    authorMatch: "",
  } as CanonWork,
});

const WORKS: Work[] = [
  g("1656", "en  Locke, Second Treatise"),
  g("3207", "en  Hobbes, Leviathan"),
  de("kant_rvernunft_1781", "de  Kant, Critik der reinen Vernunft"),
  de("hegel_phaenomenologie_1807", "de  Hegel, Phänomenologie"),
  fr("30513", "fr  Tocqueville, De la Démocratie I"),
  fr("27573", "fr  Montesquieu, Esprit des lois"),
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
  { overlap: number[]; rho: number[]; top: number[]; spread: number[] }
>();

console.log(`modell: ${MODEL_ID}\n`);

for (const entry of WORKS) {
  let text: string;
  try {
    text = await fetchWorkText(entry.work);
  } catch (err) {
    console.log(
      `${entry.label} — kunde inte hämtas: ${(err as Error).message.slice(0, 70)}\n`,
    );
    continue;
  }

  // Chunked with the English rule set for French too: `Language`
  // doesn't have an "fr" yet, and heading detection doesn't affect what's measured
  // here — only which passages become candidates.
  const chunkLang: Language = entry.lang === "de" ? "de" : "en";
  const chunks = chunkText(text, chunkLang).filter((c) => !c.isFrontMatter);
  const middle = Math.floor(chunks.length / 2);
  const sample = chunks
    .slice(Math.max(middle - CANDIDATES, 0), middle + CANDIDATES)
    .filter((c) => c.text.length > 400)
    .slice(0, CANDIDATES)
    .map((c) => c.text);

  if (sample.length < 10) {
    console.log(`${entry.label} — för få stycken\n`);
    continue;
  }

  const overlaps: number[] = [];
  const rhos: number[] = [];
  const tops: number[] = [];
  const spreads: number[] = [];
  for (const question of QUESTIONS) {
    // The scores from the Swedish query are what the app runs on. Their spread tells
    // real language comprehension apart from consistent indifference — see `.probe-rerank-more.ts`.
    const svScores = await score(question.sv, sample);
    const sv = order(svScores);
    const own = order(await score(question[entry.lang], sample));
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
    `${entry.label.padEnd(38)} ${String(sample.length).padStart(3)} kand.  ` +
      `topp-10 ${mean(overlaps).toFixed(1)}/10   ρ ${mean(rhos).toFixed(3)}   ` +
      `högsta ${mean(tops).toFixed(3)}  spann ${mean(spreads).toFixed(3)}`,
  );

  const bucket = byLang.get(entry.lang) ?? {
    overlap: [],
    rho: [],
    top: [],
    spread: [],
  };
  bucket.overlap.push(...overlaps);
  bucket.rho.push(...rhos);
  bucket.top.push(...tops);
  bucket.spread.push(...spreads);
  byLang.set(entry.lang, bucket);
}

console.log(`\n${"─".repeat(58)}\nper språk, över alla frågor och verk:`);
for (const [lang, b] of byLang) {
  console.log(
    `  ${lang}   topp-10 ${mean(b.overlap).toFixed(1)}/10   Spearman ${mean(b.rho).toFixed(3)}` +
      `   högsta poäng ${mean(b.top).toFixed(3)}   spann ${mean(b.spread).toFixed(3)}`,
  );
}
