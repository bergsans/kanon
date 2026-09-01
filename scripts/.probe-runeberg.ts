/**
 * Which Runeberg works are worth indexing?
 *
 *   pnpm tsx scripts/.probe-runeberg.ts key [key …]
 *
 * Runeberg has two kinds of works: proofread HTML chapters and raw OCR pages.
 * Only the former can be searched. The script fetches the archive, reads out what
 * the source itself says about title and author, and reports how much text results.
 */
import { fetchArchive, toText } from "../src/lib/runeberg";
import { decodeText } from "../src/lib/zip";
import type { CanonWork } from "../src/lib/corpus";

for (const key of process.argv.slice(2)) {
  const work = { id: key, sourceId: key, titleMatch: "", authorMatch: "" } as CanonWork;
  try {
    const files = await fetchArchive(work);
    const meta = Object.fromEntries(
      decodeText(files.get("Metadata") ?? Buffer.alloc(0))
        .split("\n")
        .map((l) => /^([A-Z_]+):\s*(.*)$/.exec(l.trim()))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1], m[2].trim()]),
    );
    const html = [...files.keys()].filter((f) => /^[^/]+\.html$/.test(f)).length;
    const pages = [...files.keys()].filter((f) => f.startsWith("Pages/")).length;
    const text = toText(files, work);
    console.log(
      `${key.padEnd(12)} ✓ ${String(text.length).padStart(7)} tecken  ` +
        `${String(html).padStart(3)} html / ${String(pages).padStart(4)} ocr  ` +
        `${(meta.AUTHORKEY ?? "?").padEnd(12)} ${meta.TITLE ?? "?"}`,
    );
  } catch (err) {
    console.log(`${key.padEnd(12)} ✗ ${(err as Error).message.slice(0, 110)}`);
  }
}
