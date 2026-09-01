/**
 * Where should the semantic cache's threshold sit?
 *
 * Measures cosine similarity between rephrasings of the SAME question (should hit
 * the cache) and between related but different questions (must not hit it).
 */
import { embedQuery } from "../src/lib/embed";

const SAME: [string, string][] = [
  ["Vad är det goda livet?", "vad är ett gott liv?"],
  ["Vad är det goda livet?", "Hur bör en människa leva för att leva väl?"],
  ["Får staten begränsa individens frihet?", "får staten inskränka den enskildes frihet?"],
  ["Är makt viktigare än moral för en furste?", "Ska en furste välja makten framför moralen?"],
  ["Vad händer med själen efter döden?", "Vad sker med själen när kroppen dör?"],
];

const DIFFERENT: [string, string][] = [
  ["Vad är det goda livet?", "Får staten begränsa individens frihet?"],
  ["Vad är det goda livet?", "Vad är det goda samhället?"],
  ["Vad händer med själen efter döden?", "Vad är själen?"],
  ["Civilisation kontra barbari", "Vad är civilisation?"],
  ["Är makt viktigare än moral för en furste?", "Är moral viktigare än makt för en medborgare?"],
  ["Vad är rättvisa?", "Vad är rättfärdighet inför Gud?"],
];

const cos = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // the vectors are already normalized
};

async function report(label: string, pairs: [string, string][]) {
  console.log(`\n${label}`);
  const vals: number[] = [];
  for (const [a, b] of pairs) {
    const s = cos(await embedQuery(a), await embedQuery(b));
    vals.push(s);
    console.log(`  ${s.toFixed(4)}  "${a}"  ~  "${b}"`);
  }
  console.log(`  min ${Math.min(...vals).toFixed(4)}  max ${Math.max(...vals).toFixed(4)}`);
  return vals;
}

const same = await report("SAMMA fråga, omformulerad — cachen SKA träffa:", SAME);
const diff = await report("OLIKA frågor — cachen får INTE träffa:", DIFFERENT);
console.log(
  `\nGap: lägsta \"samma\" ${Math.min(...same).toFixed(4)} vs högsta \"olika\" ${Math.max(...diff).toFixed(4)}`,
);
