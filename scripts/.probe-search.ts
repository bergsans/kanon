/**
 * Runs retrieval with a hand-written query plan, so the whole chain can be tested
 * without calling Claude: vector branches, BM25, author branch, cross-encoder, diversification.
 */
import { hybridSearch } from "../src/lib/search";

const PLAN = {
  hypotheticalPassages: [
    "The good life is not to be found in the multitude of pleasures, but in the exercise of virtue according to reason. He who orders his soul rightly, subduing the appetites to the governance of the understanding, attains that happiness which fortune cannot take away.",
    "Among the Lacedaemonians the citizens were bred to temperance from their earliest years, and the historian remarks that their felicity consisted not in riches but in the discipline of their manners and the constancy of their laws.",
    "What is a man, if his chief good and market of his time be but to sleep and feed? A beast, no more. Sure he that made us with such large discourse gave us not that capability to fust in us unused.",
  ],
  keywords: ["happiness", "virtue", "temperance", "the good", "pleasure", "the soul", "wisdom"],
  queries: {
    sv: "Vad är det goda livet, och hur bör en människa leva?",
    en: "What is the good life, and how ought a person to live?",
  },
};

async function run(label: string, opts: Parameters<typeof hybridSearch>[0]) {
  const t = Date.now();
  const out = await hybridSearch(opts);
  const genres = new Map<string, number>();
  for (const c of out) genres.set(c.genre, (genres.get(c.genre) ?? 0) + 1);
  console.log(`\n${label}  (${Date.now() - t} ms)`);
  console.log(
    `  ${out.length} kandidater · ${new Set(out.map((c) => c.author)).size} författare · ` +
      `${out.filter((c) => c.language === "sv").length} svenska · ` +
      [...genres].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join(", "),
  );
  for (const c of out.slice(0, 8)) {
    const score = c.crossScore === undefined ? "  –  " : c.crossScore.toFixed(3);
    console.log(
      `   ${score} [${c.sources.map((s) => s[0]).join("")}] ${c.author} — ${c.title.slice(0, 44)}`,
    );
  }
}

await run("UTAN cross-encoder", { ...PLAN, queries: undefined, limit: 20 });
await run("MED cross-encoder", { ...PLAN, limit: 20 });
await run("MED författargren (mentions: Aristotle)", { ...PLAN, mentions: ["Aristotle"], limit: 20 });
