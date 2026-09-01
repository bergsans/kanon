/**
 * The historical era a work's year falls into — shared by every manifest
 * generator, since a work's era has to mean the same thing regardless of
 * which source it came from.
 *
 * This function used to be copied into all eight `build-corpus*.ts`
 * scripts, seven of them byte-identical and one — `build-corpus.ts`, the
 * Gutenberg generator, by far the largest source — silently different:
 * `<=` instead of `<`, and different cutoff years (500/1400/1600 instead
 * of 500/1450/1650). The result showed up in the manifest rather than in
 * any error: Shakespeare and Cervantes, both dead 1616, were "upplysning"
 * (Enlightenment) under Gutenberg's rule and "renässans" under everyone
 * else's, and an author who died exactly in 1900 landed in "1800-tal" from
 * Gutenberg but "1900-tal" from every other source.
 *
 * The boundaries below are the ones seven of the eight generators already
 * agreed on, not a new measurement — nothing in this repo has weighed one
 * cutoff year against another the way a `.probe-*.ts` does for a model
 * choice. They're conventional period boundaries (antiquity to 500,
 * medieval to the Renaissance around 1450, to the Enlightenment around
 * 1650, to the 19th century at 1800, to the 20th at 1900), kept here
 * unchanged from what the majority already did, so regenerating the
 * manifest moves only the works that were on Gutenberg's wrong side of a
 * line, not the whole collection's period grouping.
 */

import type { Era } from "../../src/lib/corpus";

export function eraOf(year: number): Era {
  if (year < 500) return "antiken";
  if (year < 1450) return "medeltid";
  if (year < 1650) return "renässans";
  if (year < 1800) return "upplysning";
  if (year < 1900) return "1800-tal";
  return "1900-tal";
}
