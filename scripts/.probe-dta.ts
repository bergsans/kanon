/**
 * Does a DTA text qualify for indexing?
 *
 *   pnpm tsx scripts/.probe-dta.ts kant_rvernunft_1781 hegel_phaenomenologie_1807
 *
 * Four questions, and the last three are German-specific problems that don't exist in any
 * other source:
 *
 *   1. Does the file carry a CC line?
 *   2. Are the long s and the old umlaut diacritics normalized? A leftover "kuͤnftigen"
 *      is not the same word as "künftigen" to either BM25 or the embedding.
 *   3. Are line-break hyphens rejoined? 28% of Kant's lines end mid-word.
 *   4. Do the passages get a locator? DTA's divs lack a type, so the locator has to come
 *      from the source's own headings — and those are in German.
 *
 * The text sample is the most important part of the output. The first three errors don't show
 * in a number, only in a sentence you read.
 *
 * The fetch goes to DTA and the model doesn't run at all. No Claude, no tokens.
 */
import { chunkText } from "../src/lib/chunk";
import { FREE_LICENCE, fetchRaw, parseHeader, readerUrl, toText } from "../src/lib/dta";
import type { CanonWork } from "../src/lib/corpus";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Ange minst ett DTA-id, t.ex. kant_rvernunft_1781.");
  process.exit(1);
}

for (const id of ids) {
  const work = { id, sourceId: id, titleMatch: "", authorMatch: "" } as CanonWork;
  try {
    const raw = await fetchRaw(work);
    const head = parseHeader(raw);
    const text = toText(raw, work);
    const chunks = chunkText(text, "de");
    const body = chunks.filter((c) => !c.isFrontMatter);
    const cc = FREE_LICENCE.test(head.licence ?? "");

    console.log(
      `\n${id}\n` +
        `  ${cc ? "✓" : "✗"} rätt      ${(head.licence ?? "(ingen licensrad)").slice(0, 72)}\n` +
        `    verk      ${head.author ?? "?"} — ${(head.title ?? "?").slice(0, 58)}\n` +
        `    förlaga   ${head.year ?? "?"}\n` +
        `    text      ${(text.length / 1000).toFixed(0)}k tecken → ${chunks.length} stycken ` +
        `(${chunks.length - body.length} förtext)\n` +
        `    läsare    ${readerUrl(id)}`,
    );

    const withLocator = body.filter((c) => c.locator).length;
    const share = body.length > 0 ? Math.round((withLocator / body.length) * 100) : 0;
    console.log(
      `    locator   ${withLocator}/${body.length} sökbara stycken (${share} %)` +
        `${withLocator > 0 ? `, t.ex. "${body.find((c) => c.locator)?.locator}"` : ""}`,
    );

    // Leftover 18th-century print artifacts. All three should be zero.
    const longS = (text.match(/[ſẛ]/g) ?? []).length;
    const combining = (text.match(/[ͤͥͦͧ]/g) ?? []).length;
    const brokenWords = (text.match(/\p{Ll}- \p{Ll}/gu) ?? []).length;
    console.log(
      `    kvar      ${longS} långt s · ${combining} överskrivna vokaler · ` +
        `${brokenWords} misstänkta delade ord`,
    );

    const sample = body.find((c) => c.text.length > 500)?.text ?? text.slice(0, 500);
    console.log(`    prov      ${sample.replace(/\s+/g, " ").slice(0, 320)}…`);
  } catch (err) {
    console.log(`\n${id}\n  ✗ ${(err as Error).message.slice(0, 170)}`);
  }
}
