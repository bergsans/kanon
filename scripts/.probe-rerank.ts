/**
 * Can the cross-encoder handle a SWEDISH query against ENGLISH 19th-century prose?
 *
 * Measure: how similar the rankings become when the same candidates are scored with the
 * Swedish query versus its English equivalent. If the model keeps the languages
 * together, the lists should be nearly identical.
 */
import { AutoModelForSequenceClassification, AutoTokenizer } from "@huggingface/transformers";
import Database from "better-sqlite3";
import { DB_PATH } from "../src/lib/db";

const SV = "Vad är det goda livet, och hur bör en människa leva?";
const EN = "What is the good life, and how ought a person to live?";

const db = new Database(DB_PATH, { readonly: true });
const rows = db
  .prepare(
    `select c.id, w.author, w.title, c.text
       from chunks_fts f join chunks c on c.id = f.rowid join works w on w.id = c.work_id
      where chunks_fts match ? and c.is_front_matter = 0
      order by bm25(chunks_fts) limit 40`,
  )
  .all('"happiness" OR "virtue" OR "the good" OR "pleasure" OR "temperance"') as
  { id: number; author: string; title: string; text: string }[];

for (const ID of ["Xenova/bge-reranker-base", "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"]) {
  const dtype = ID.startsWith("Xenova") ? "q8" : "fp32";
  const tokenizer = await AutoTokenizer.from_pretrained(ID);
  const model = await AutoModelForSequenceClassification.from_pretrained(ID, { dtype: dtype as "q8" });

  const rank = async (query: string) => {
    const scores: number[] = [];
    for (let i = 0; i < rows.length; i += 16) {
      const slice = rows.slice(i, i + 16);
      const inputs = await tokenizer(slice.map(() => query), {
        text_pair: slice.map((r) => r.text.slice(0, 1400)),
        padding: true, truncation: true,
      });
      const { logits } = await model(inputs);
      scores.push(...(logits.sigmoid().tolist() as number[][]).map((x) => x[0]));
    }
    return rows.map((r, i) => ({ ...r, score: scores[i] })).sort((a, b) => b.score - a.score);
  };

  const sv = await rank(SV);
  const en = await rank(EN);

  const top10sv = new Set(sv.slice(0, 10).map((r) => r.id));
  const overlap = en.slice(0, 10).filter((r) => top10sv.has(r.id)).length;

  // Spearman over the whole list.
  const posEn = new Map(en.map((r, i) => [r.id, i]));
  const d2 = sv.reduce((s, r, i) => s + (i - posEn.get(r.id)!) ** 2, 0);
  const n = rows.length;
  const rho = 1 - (6 * d2) / (n * (n * n - 1));

  console.log(`\n== ${ID}`);
  console.log(`   topp-10 överlapp sv/en: ${overlap}/10   Spearman: ${rho.toFixed(3)}`);
  console.log(`   svensk fråga, topp 5:`);
  for (const r of sv.slice(0, 5)) console.log(`     ${r.score.toFixed(3)}  ${r.author} — ${r.title}`);
  console.log(`   poängspann: ${sv[0].score.toFixed(3)} … ${sv[sv.length - 1].score.toFixed(4)}`);
}
