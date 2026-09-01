/**
 * Does a TCP text qualify for indexing?
 *
 *   pnpm tsx scripts/.probe-tcp.ts A43998 A50919 [id …]
 *
 * Three questions, and they differ from Perseus's three. Rights are simple here —
 * everything is CC0 and the works were printed before 1700 — so what matters instead is
 * the transcription's condition:
 *
 *   1. Does the file carry a CC0 line? The catalog's `Status` column isn't good enough, see `tcp.ts`.
 *   2. How much is illegible? Lost *words* per thousand, against
 *      `MAX_LOST_WORDS_PER_1000` — not all gaps, since 85% of them are a single
 *      letter and cost nothing. See `tcp.ts`.
 *   3. Do the passages get a locator? TCP has no canonical citation order like
 *      Perseus, just the divs' `n` and the source's own headings.
 *
 * The script also shows a text sample, since that's the only way to see whether
 * line-break hyphens and the long s were actually handled. The fetch goes to GitHub's
 * CDN and is free — no Claude, no tokens.
 */
import { chunkText } from "../src/lib/chunk";
import { fetchRaw, MAX_LOST_WORDS_PER_1000, parseHeader, toTcpText } from "../src/lib/tcp";
import type { CanonWork } from "../src/lib/corpus";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Ange minst ett TCP-id, t.ex. A43998 (Leviathan 1651).");
  process.exit(1);
}

for (const id of ids) {
  const work = { id, sourceId: id, titleMatch: "", authorMatch: "" } as CanonWork;
  try {
    const raw = await fetchRaw(work);
    const head = parseHeader(raw);
    const { text, gaps, lostWords, words } = toTcpText(raw, work);
    const lost = words > 0 ? (lostWords / words) * 1000 : 0;
    const density = words > 0 ? (gaps / words) * 1000 : 0;
    const chunks = chunkText(text, "en");
    const body = chunks.filter((c) => !c.isFrontMatter);
    const cc0 = /creativecommons\.org\/publicdomain\/zero|creative commons 0 1\.0|cc0 1\.0/i.test(
      head.availability ?? "",
    );

    console.log(
      `\n${id}\n` +
        `  ${cc0 ? "✓" : "✗"} rätt      ${cc0 ? "CC0" : "INGEN CC0-RAD"}\n` +
        `    verk      ${(head.author ?? "?").slice(0, 46)} — ${(head.title ?? "?").slice(0, 60)}\n` +
        `    utgåva    ${head.year ?? "?"}\n` +
        `  ${lost <= MAX_LOST_WORDS_PER_1000 ? "✓" : "✗"} skick     ${lostWords} förlorade ord / ${words} = ` +
        `${lost.toFixed(2)} per 1000 (gräns ${MAX_LOST_WORDS_PER_1000}); ` +
        `${gaps} luckor totalt = ${density.toFixed(1)}/1000\n` +
        `    text      ${(text.length / 1000).toFixed(0)}k tecken → ${chunks.length} stycken ` +
        `(${chunks.length - body.length} förtext)`,
    );

    const withLocator = body.filter((c) => c.locator).length;
    const share = body.length > 0 ? Math.round((withLocator / body.length) * 100) : 0;
    console.log(
      `    locator   ${withLocator}/${body.length} sökbara stycken (${share} %)` +
        `${withLocator > 0 ? `, t.ex. "${body.find((c) => c.locator)?.locator}"` : ""}`,
    );

    // The text sample is the whole point: the long s and line-break hyphens don't show in a
    // number, only in a sentence you read.
    const sample = body.find((c) => c.text.length > 400)?.text ?? text.slice(0, 400);
    console.log(`    prov      ${sample.replace(/\s+/g, " ").slice(0, 300)}…`);
    const leftovers = (text.match(/[ſẛ]/g) ?? []).length;
    if (leftovers > 0) console.log(`    ⚠ ${leftovers} långt s kvar i texten`);
  } catch (err) {
    console.log(`\n${id}\n  ✗ ${(err as Error).message.slice(0, 170)}`);
  }
}
