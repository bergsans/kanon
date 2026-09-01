/**
 * Measures what the local reranking costs in latency — model, batch size, and
 * how much of the passage is actually fed in.
 *
 *   pnpm tsx scripts/.bench-rerank.ts [model] [dtype]
 */
import { AutoModelForSequenceClassification, AutoTokenizer } from "@huggingface/transformers";
import Database from "better-sqlite3";
import { DB_PATH } from "../src/lib/db";

const ID = process.argv[2] ?? "Xenova/bge-reranker-base";
const DTYPE = (process.argv[3] ?? "q8") as "q8" | "fp32";

const db = new Database(DB_PATH, { readonly: true });
const rows = db.prepare("select text from chunks where is_front_matter = 0 limit 80").all() as { text: string }[];
console.log(`${rows.length} stycken, snittlängd ${Math.round(rows.reduce((s, r) => s + r.text.length, 0) / rows.length)} tecken`);

let t = Date.now();
const tokenizer = await AutoTokenizer.from_pretrained(ID);
const model = await AutoModelForSequenceClassification.from_pretrained(ID, { dtype: DTYPE });
console.log(`${ID} (${DTYPE}) laddad på ${((Date.now() - t) / 1000).toFixed(1)} s\n`);

const QUERY = "Vad är det goda livet, och hur bör en människa leva?";

async function score(passages: string[], maxChars: number, batch: number) {
  const scores: number[] = [];
  const t0 = Date.now();
  for (let i = 0; i < passages.length; i += batch) {
    const slice = passages.slice(i, i + batch);
    const inputs = await tokenizer(
      slice.map(() => QUERY),
      { text_pair: slice.map((p) => p.slice(0, maxChars)), padding: true, truncation: true },
    );
    const { logits } = await model(inputs);
    scores.push(...(logits.sigmoid().tolist() as number[][]).map((x) => x[0]));
  }
  return { ms: Date.now() - t0, scores };
}

for (const [maxChars, batch] of [[1400, 16], [900, 16], [1400, 8]] as const) {
  const r = await score(rows.map((x) => x.text), maxChars, batch);
  console.log(
    `maxChars=${maxChars} batch=${batch}: ${r.ms} ms / ${rows.length} par ` +
      `= ${(r.ms / rows.length).toFixed(0)} ms per par`,
  );
}
