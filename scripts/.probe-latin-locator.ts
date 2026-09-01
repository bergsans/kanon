/**
 * Do the Latin Perseus texts get a locator?
 *
 *   pnpm tsx scripts/.probe-latin-locator.ts urn:cts:latinLit:phi0474.phi005.perseus-lat2 [urn …]
 *
 * Exists because the answer was no the first time, and the bug was subtle: `perseus.ts`
 * builds the locator from the CTS catalog's unit names, which are ENGLISH regardless of
 * the text's language. Cicero's *In Verrem* got the heading "ACTIO 1, BOOK 1 — IN C. VERREM ACTIO
 * PRIMA", and the chunker's Latin keyword list didn't recognize "BOOK". The work
 * was indexed with 892 passages and `locator: null` on every single one.
 *
 * Costs nothing: reads the disk cache, no model, no Claude.
 */
import { chunkText } from "../src/lib/chunk";
import { fetchRaw, toText } from "../src/lib/perseus";
import type { CanonWork } from "../src/lib/corpus";

const urns = process.argv.slice(2);
if (urns.length === 0) {
  console.error("Ange minst ett CTS-URN för en latinsk utgåva.");
  process.exit(1);
}

for (const urn of urns) {
  const work = { id: urn, sourceId: urn, titleMatch: "", authorMatch: "" } as CanonWork;
  try {
    const text = toText(await fetchRaw(work), work);
    const chunks = chunkText(text, "la");
    const body = chunks.filter((c) => !c.isFrontMatter);
    const withLocator = body.filter((c) => c.locator).length;
    const share = body.length > 0 ? Math.round((withLocator / body.length) * 100) : 0;
    console.log(
      `${share === 100 ? "✓" : share > 0 ? "~" : "✗"} ${urn}\n` +
        `    ${withLocator}/${body.length} stycken med hänvisning (${share} %)` +
        `${withLocator > 0 ? `, t.ex. "${body.find((c) => c.locator)?.locator}"` : ""}`,
    );
  } catch (err) {
    console.log(`✗ ${urn}\n    ${(err as Error).message.slice(0, 120)}`);
  }
}
