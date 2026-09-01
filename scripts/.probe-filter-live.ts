/**
 * Does the filter hold all the way through retrieval, and what does it cost in latency?
 *
 * The plan is canned — the same four HyDE passages and keywords every round — so nothing
 * goes to Claude and the run is free. It's also the only way to compare the
 * rounds with each other: query expansion makes up new passages every time, and two
 * runs against that would have measured its noise as much as the filter.
 *
 * The cross-encoder is disabled. It's unaffected by the filter and costs seven seconds per
 * round; what's being tested here is the branches, RRF, and the diversification filter.
 */
import { hybridSearch } from "../src/lib/search";
import { CANDIDATES } from "../src/lib/claude";
import type { CorpusFilter } from "../src/lib/taxonomy";

const PLAN = {
  hypotheticalPassages: [
    "It is the part of the philosopher to inquire whether the successive ages of mankind exhibit a true advance, or whether the appearance of improvement be but a shifting of the same passions into new forms.",
    "Among the tribes of the interior we found no memory of any ancestor beyond the third generation, nor any tradition of a golden age; their implements of stone differ little from those disinterred in the barrows of our own country.",
    "And is it your opinion, sir, that the world grows better? Nay, said he, I have seen too many winters. The son builds where the father burned, and the grandson burns again what was built.",
    "It is the necessity of the Idea that it pass through its own negation and return to itself enriched, so that what seems the ruin of one age is but the labour-pain of the next.",
  ],
  keywords: [
    "progress", "decline", "civilization", "rude nations", "savage", "manners",
    "corruption", "luxury", "perfectibility", "the golden age",
  ],
  mentions: [] as string[],
};

const CASES: [string, CorpusFilter, string[]?][] = [
  ["ofiltrerat", { genres: [], eras: [] }],
  ["ämne: dikt", { genres: ["dikt"], eras: [] }],
  ["ämne: religion (smalt, exakt gren)", { genres: ["religion"], eras: [] }],
  ["epok: antiken", { genres: [], eras: ["antiken"] }],
  ["epok: 1900-tal", { genres: [], eras: ["1900-tal"] }],
  ["ämne + epok: filosofi i antiken", { genres: ["filosofi"], eras: ["antiken"] }],
  ["tre ämnen", { genres: ["drama", "dikt", "prosa"], eras: [] }],
  // The mention branch should obey the filter too: Plato exists in both the philosophy and drama
  // neighborhoods, but only the philosophy works may answer here.
  ["mention Plato + ämne filosofi", { genres: ["filosofi"], eras: [] }, ["Plato"]],
];

for (const [label, filter, mentions] of CASES) {
  const t0 = performance.now();
  const hits = await hybridSearch({
    ...PLAN,
    mentions: mentions ?? PLAN.mentions,
    filter,
    limit: CANDIDATES,
    disableRerank: true,
  });
  const ms = performance.now() - t0;

  const genres = new Map<string, number>();
  const eras = new Set<string>();
  let outside = 0;
  for (const c of hits) {
    genres.set(c.genre, (genres.get(c.genre) ?? 0) + 1);
    if (filter.genres.length && !filter.genres.includes(c.genre)) outside++;
  }
  // The era doesn't travel with the candidate — it's read from the work, so it's enough
  // to check the years fall within the chosen era span via `works`.
  const rows = hits.length
    ? (
        await import("../src/lib/db")
      ).getDb()
        .prepare(
          `select distinct era from works where id in (${hits.map(() => "?").join(",")})`,
        )
        .all(...hits.map((h) => h.workId)) as { era: string }[]
    : [];
  for (const r of rows) {
    eras.add(r.era);
    if (filter.eras.length && !filter.eras.includes(r.era as never)) outside++;
  }

  console.log(
    `\n${label}\n  ${hits.length} kandidater på ${ms.toFixed(0)} ms` +
      `${outside ? `  ⚠ ${outside} UTANFÖR FILTRET` : "  ✓ alla inom filtret"}`,
  );
  console.log(
    `  genrer: ${[...genres].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join(", ")}`,
  );
  console.log(`  epoker: ${[...eras].join(", ")}`);
  console.log(
    `  först:  ${hits[0]?.author ?? "—"}, ${hits[0]?.title ?? ""} [${hits[0]?.sources.join("+") ?? ""}]`,
  );
}
