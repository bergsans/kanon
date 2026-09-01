/**
 * Does a Perseus text qualify for indexing, and at what level should it be cited?
 *
 *   pnpm tsx scripts/.probe-perseus.ts urn:cts:greekLit:tlg0003.tlg001.perseus-eng4 [urn …]
 *
 * Three questions per text, and all three must be answered before a line can be written into
 * `build-corpus-perseus.ts`:
 *
 *   1. Does the file itself say it's freely licensed? The archive's CC BY-SA applies to
 *      the archive; the line that matters is in each file's own teiHeader.
 *   2. How old is the source? A translation gets seventy years from the translator's
 *      death, and the print year is the only thing the source discloses about that.
 *   3. Which citation level is the locator? Chunking breaks at every heading, so
 *      a level that's shorter than a chunk on average chops the work up instead
 *      of pinpointing it. The table shows the average per level, and the arrow marks the level
 *      `locatorDepth` actually picks.
 *
 * The fetch goes to GitHub's CDN and is free. No Claude, no tokens.
 */
import { chunkText } from "../src/lib/chunk";
import { fetchRaw, levelStats, parseHeader, readerUrl, rightsGround, toText } from "../src/lib/perseus";
import type { CanonWork } from "../src/lib/corpus";

const urns = process.argv.slice(2);
if (urns.length === 0) {
  console.error("Ange minst ett CTS-URN. Se filhuvudet.");
  process.exit(1);
}

for (const urn of urns) {
  const work = { id: urn, sourceId: urn, titleMatch: "", authorMatch: "" } as CanonWork;
  try {
    const raw = await fetchRaw(work);
    const head = parseHeader(raw);
    const text = toText(raw, work);
    const chunks = chunkText(text, "en");
    const body = chunks.filter((c) => !c.isFrontMatter);
    const stats = levelStats(raw);

    const ground = rightsGround(head);

    console.log(
      `\n${urn}\n` +
        `  ${ground ? "✓" : "✗"} rätt      ${ground ? `fri på ${ground}` : "AVVISAS"} — ` +
        `${(head.licence ?? "(ingen licensrad)").slice(0, 72)}\n` +
        `    förlaga   ${head.imprintYear ?? "?"}   översättare: ${head.translator ?? "—"}\n` +
        `    verk      ${head.author ?? "?"} — ${head.title ?? "?"}\n` +
        `    text      ${(text.length / 1000).toFixed(0)}k tecken → ${chunks.length} stycken ` +
        `(${chunks.length - body.length} förtext)\n` +
        `    läsare    ${readerUrl(urn)}`,
    );

    // The average per citation level. The chosen level is the deepest one that stays
    // above the chunker's lower bound — see `LOCATOR_MIN_CHARS` in perseus.ts.
    const chosen = stats.filter((s) => s.mean >= 900).at(-1)?.depth ?? 1;
    for (const s of stats) {
      console.log(
        `    ${s.depth === chosen ? "→" : " "} nivå ${s.depth}   ` +
          `${String(s.units).padStart(5)} enheter   ${s.mean.toFixed(0).padStart(6)} tecken i snitt`,
      );
    }

    const withLocator = body.filter((c) => c.locator).length;
    console.log(
      `    locator   ${withLocator}/${body.length} sökbara stycken har en hänvisning` +
        `${body.length > 0 ? `, t.ex. "${body.find((c) => c.locator)?.locator ?? "—"}"` : ""}`,
    );
  } catch (err) {
    console.log(`\n${urn}\n  ✗ ${(err as Error).message.slice(0, 160)}`);
  }
}
