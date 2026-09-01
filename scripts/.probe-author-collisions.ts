/**
 * Whether `DISPLAY_AUTHOR` (`src/lib/corpus.ts`) actually corresponds to
 * something in the manifests — that each abbreviated form and each full
 * form named in the table's own comment really occurs, and in the source
 * the comment says it occurs in.
 *
 *   pnpm tsx scripts/.probe-author-collisions.ts
 *
 * Only confirms the ~6 pairs the table already lists; it does not search
 * for further undiscovered collisions; the table's own comment explains why
 * that broader search isn't attempted here — a short-name/full-name pair
 * can't be told apart from two distinct people sharing a surname (Brontë,
 * Humboldt, Mill/Taylor Mill) without a hand check per case.
 *
 * Only reads the manifests. Costs nothing, calls nothing.
 */
import { DISPLAY_AUTHOR } from "../src/lib/corpus";
import gutenbergData from "../src/lib/corpus.json";
import perseusData from "../src/lib/corpus-perseus.json";
import dtaData from "../src/lib/corpus-dta.json";
import germanGutenbergData from "../src/lib/corpus-gde.json";

const MANIFESTS: Record<string, { author: string }[]> = {
  "corpus.json (Gutenberg, English)": gutenbergData as { author: string }[],
  "corpus-perseus.json": perseusData as { author: string }[],
  "corpus-dta.json": dtaData as { author: string }[],
  "corpus-gde.json (Gutenberg, German)": germanGutenbergData as {
    author: string;
  }[],
};

function findIn(name: string): string[] {
  return Object.entries(MANIFESTS)
    .filter(([, works]) => works.some((w) => w.author === name))
    .map(([source]) => source);
}

let allConfirmed = true;
for (const [short, full] of Object.entries(DISPLAY_AUTHOR)) {
  const shortIn = findIn(short);
  const fullIn = findIn(full);
  const ok = shortIn.length > 0 && fullIn.length > 0;
  if (!ok) allConfirmed = false;
  console.log(`${ok ? "OK  " : "MISS"} "${short}" → "${full}"`);
  console.log(`     short form found in: ${shortIn.join(", ") || "(nowhere)"}`);
  console.log(`     full form found in:  ${fullIn.join(", ") || "(nowhere)"}`);
}

console.log(
  allConfirmed
    ? "\nEvery DISPLAY_AUTHOR pair is confirmed in the manifests."
    : "\nAt least one pair did not check out — see MISS lines above.",
);
