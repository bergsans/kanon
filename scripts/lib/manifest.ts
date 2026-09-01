/**
 * The mechanical tail every `build-corpus*.ts` generator shares: refuse to
 * write a manifest with two works sharing an ID, then write it — or, under
 * `--dry`, report without writing. Everything before this point (fetching,
 * rights checks, chunking) differs per source and stays in each generator;
 * this is only the part that was actually identical.
 */

import fs from "node:fs";

/** The minimum shape `assertNoDuplicateIds` needs to report a collision. */
export interface IdentifiedWork {
  id: string;
  title: string;
}

/**
 * Stops the run if two works share an ID.
 *
 * A manifest with two works sharing an ID is silent data corruption:
 * `WORK_BY_ID` (corpus.ts) drops all but the last one, and ingest deletes
 * and rewrites the same rows in a loop until `vec_chunks` objects — see
 * AGENTS.md's own account of the bug this guard exists to catch
 * (Montaigne's four volumes collapsing into one ID). Every generator but
 * `build-corpus-mia.ts` already had this check; that one didn't, purely by
 * omission — MIA has one work per author today, so the gap never showed.
 */
export function assertNoDuplicateIds<T extends IdentifiedWork>(works: T[]): void {
  const ids = new Map<string, string>();
  for (const w of works) {
    const clash = ids.get(w.id);
    if (clash) {
      console.error(`\n✗ Två verk delar ID "${w.id}":\n    ${clash}\n    ${w.title}`);
      process.exit(1);
    }
    ids.set(w.id, w.title);
  }
}

/**
 * Writes the manifest, or — under `--dry` — reports without writing.
 *
 * The file-size line used to appear only in `build-corpus.ts` and
 * `build-corpus-sv.ts`, the two largest sources; every other generator's
 * plain `Skrev ${OUT_PATH}` is now the same line with the size folded in,
 * not a second convention to keep track of.
 */
export function writeManifest<T>(outPath: string, works: T[], dry: boolean): void {
  if (dry) {
    console.log("\n--dry: skrev inte filen.");
    return;
  }
  fs.writeFileSync(outPath, JSON.stringify(works, null, 1) + "\n", "utf8");
  console.log(
    `Skrev ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} kB)`,
  );
}
