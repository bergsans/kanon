/** The full MIA chain: fetching, license check, assembly, chunking. */
import { CORPUS } from "../src/lib/corpus";
import { fetchWorkText } from "../src/lib/sources";
import { chunkText } from "../src/lib/chunk";

for (const work of CORPUS.filter((w) => w.source === "marxists")) {
  const text = await fetchWorkText(work);
  const chunks = chunkText(text, work.language);
  const body = chunks.filter((c) => !c.isFrontMatter);
  const locators = [...new Set(body.map((c) => c.locator).filter(Boolean))];
  console.log(`\n${work.author} — ${work.title}`);
  console.log(`  ${work.parts?.length} artiklar → ${(text.length / 1000).toFixed(0)}k tecken, ${chunks.length} stycken, ${locators.length} locators`);
  console.log(`  locators: ${locators.slice(0, 5).join(" | ")}`);
  const s = body[Math.floor(body.length / 2)];
  console.log(`  mitt i: [${s?.locator}] ${JSON.stringify(s?.text.slice(0, 130))}`);
}
