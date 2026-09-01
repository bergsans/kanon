/**
 * Does the cross-encoder work at all, right now, on this machine?
 *
 * `.probe-ruskin3.ts` gave 0.073 where the README has 0.685 for the same kind of pair. Before
 * saying anything about Ruskin, the model must be checked against pairs where the answer is known:
 * the mmarco model is trained on MS MARCO, and a textbook pair should score close to 1.
 */
import { scorePairs, MODEL_ID } from "../src/lib/rerank";

console.log(`modell: ${MODEL_ID}`);
console.log(`dtype:  ${process.env.CANON_RERANK_DTYPE ?? "fp32 (standard)"}`);
console.log(`på:     ${process.env.CANON_LOCAL_RERANK !== "0"}\n`);

const PAIRS: { label: string; query: string; passage: string }[] = [
  {
    label: "lärobok, träff",
    query: "What is the capital of France?",
    passage:
      "Paris is the capital and most populous city of France, situated on the river Seine in the north of the country.",
  },
  {
    label: "lärobok, miss",
    query: "What is the capital of France?",
    passage:
      "The blue whale is the largest animal known to have existed, reaching lengths of up to thirty metres.",
  },
  {
    label: "lärobok, träff (sv fråga)",
    query: "Vad är Frankrikes huvudstad?",
    passage:
      "Paris is the capital and most populous city of France, situated on the river Seine in the north of the country.",
  },
  {
    label: "kanon, träff",
    query: "vad säger Kant om lögnen?",
    passage:
      "To be truthful (honest) in all declarations is a sacred and unconditionally commanding law of reason that admits of no expediency whatsoever. A lie always harms another; if not some other human being, then it nevertheless does harm to humanity in general.",
  },
];

const scores = await scorePairs(PAIRS.map((p) => ({ query: p.query, passage: p.passage })));
for (let i = 0; i < PAIRS.length; i++) {
  console.log(`  ${PAIRS[i].label.padEnd(26)} ${scores[i].toFixed(4)}`);
}

// One pair on its own: batching with padding is the only difference between the calls
// above and a single call, and it shouldn't move a number.
const alone = await scorePairs([{ query: PAIRS[0].query, passage: PAIRS[0].passage }]);
console.log(`\n  samma första par ensamt i anropet: ${alone[0].toFixed(4)}`);
