/**
 * Project tags: parsing, normalizing, and the limits both sides agree on.
 *
 * Split out of `projects.ts` because that module imports `getDb`
 * (`better-sqlite3`), which can't be pulled into a `"use client"` component —
 * and the tag-entry UI needs the same `MAX_TAGS`/`MAX_TAG_LENGTH` the server
 * enforces, not a second copy of the same two numbers that could drift.
 */

/** A tag is a word or two, not a sentence. */
export const MAX_TAG_LENGTH = 40;

/** More than this makes the pill row wider than the benefit of telling them apart. */
export const MAX_TAGS = 10;

/** Tags as the database stores them: comma-separated, empties dropped. */
export function parseTags(stored: string): string[] {
  return stored ? stored.split(",").filter(Boolean) : [];
}

/**
 * Trims, caps and deduplicates a list of tags from a form field.
 *
 * Case is preserved in the first occurrence but doesn't decide whether two
 * tags are the same — "Stoicism" and "stoicism" should become one pill, not
 * two that happen to look alike in the list.
 */
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of raw) {
    // Storage is comma-separated (`parseTags` above), so a comma inside a
    // tag would split it back into two on the next read — "a,b" typed as
    // one tag silently became two pills after a reload.
    const trimmed = tag.replace(/,/g, "").trim().slice(0, MAX_TAG_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(trimmed);
    if (tags.length === MAX_TAGS) break;
  }
  return tags;
}
