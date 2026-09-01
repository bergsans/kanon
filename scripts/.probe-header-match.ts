/**
 * Checks that the manifest's `titleMatch`/`authorMatch` survive the file's own
 * header — BEFORE an hours-long ingest discovers it.
 *
 *   pnpm tsx scripts/.probe-header-match.ts --new     only works not yet in HEAD
 *   pnpm tsx scripts/.probe-header-match.ts --all     the whole Gutenberg manifest
 *   pnpm tsx scripts/.probe-header-match.ts --nonascii  only names with non-ASCII characters
 *
 * Why it exists: `authorMatch` is derived from the CATALOG while `verifyHeader` checks
 * it against the FILE, and the two don't always spell it the same way. It's the same trap
 * that tripped up sixteen Perseus works on "Appianus" vs. "Appian", and it hits hardest on
 * names the catalog writes with diacritics: Gutenberg's file header for Camões says
 * "Luis de Camoens" — neither "camões" nor "camoes".
 *
 * The verification that counts lives in `gutenberg.ts` and runs on every indexing pass.
 * This probe is just a way to find out in advance — it changes nothing.
 */
import { execSync } from "node:child_process";
import { verifyHeader, textUrl } from "../src/lib/gutenberg";
import type { CanonWork } from "../src/lib/corpus";
import manifest from "../src/lib/corpus.json";

const works = manifest as unknown as CanonWork[];

function selection(): CanonWork[] {
  const mode = process.argv.find((a) => a.startsWith("--")) ?? "--new";
  if (mode === "--all") return works;
  if (mode === "--nonascii") {
    return works.filter((w) => /[^\x00-\x7F]/.test(w.author + w.title));
  }
  // Compares against the manifest in HEAD: anything without an ID there is new in this
  // change, and those are exactly the rows no one has seen a file for yet.
  const head = JSON.parse(
    execSync("git show HEAD:src/lib/corpus.json", { encoding: "utf8", maxBuffer: 64 << 20 }),
  ) as CanonWork[];
  const known = new Set(head.map((w) => w.id));
  return works.filter((w) => !known.has(w.id));
}

async function head3000(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "canon-indexer/0.1 (personal research project)",
      // Only the header is needed. Without Range the whole book is fetched — `The Anatomy of
      // Melancholy` is 2.5 MB and the check reads 3,000 characters of it.
      Range: "bytes=0-4000",
    },
  });
  if (!res.ok && res.status !== 206) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function main() {
  const picked = selection().filter((w) => w.source === "gutenberg");
  console.log(`Prövar ${picked.length} verk mot Gutenbergs filhuvuden.\n`);

  const failed: string[] = [];
  for (const [i, w] of picked.entries()) {
    try {
      const raw = await head3000(textUrl(w.sourceId));
      verifyHeader(raw, w);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push(msg);
      console.log(`✗ ${w.author} — ${w.title}\n   ${msg}`);
    }
    // The same courtesy toward gutenberg.org that fetchRaw maintains.
    if (i < picked.length - 1) await new Promise((r) => setTimeout(r, 400));
  }

  console.log(
    `\n${picked.length - failed.length} av ${picked.length} klarade huvudet.` +
      (failed.length ? ` ${failed.length} skulle avbryta ingest.` : ""),
  );
}

void main();
