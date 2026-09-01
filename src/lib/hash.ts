import crypto from "node:crypto";

/**
 * The fingerprint of a passage's text, the guard against a reused chunk ID.
 *
 * SQLite hands out rowids again after a deletion, so after a re-index row 4711
 * can be a completely different passage than the one a stored row points at —
 * `ingest.ts` found 948 orphaned vector rows proving the reuse happens. Every
 * table that keeps a chunk ID without its text (translations, project
 * passages, saved searches) stores this next to it and treats a mismatch as a
 * miss.
 *
 * One function and not a copy per table: the stored values are compared
 * across runs, and two copies that drifted in length or algorithm would turn
 * every stored row into a miss at once.
 */
export function textHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}
