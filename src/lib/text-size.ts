/**
 * The reading view's font-size steps.
 *
 * Isomorphic on purpose: `TextSizeProvider.tsx` (a client store) and the
 * root layout's inline script (reads the same `localStorage` key and sets
 * the same percentages before first paint — see `layout.tsx`) both need the
 * exact same mapping, and two copies of it would have been free to drift
 * apart the next time either one changed.
 */

export const TEXT_SIZES = ["sm", "md", "lg"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_STORAGE_KEY = "canon:reader-text-size";

/**
 * The step, as a percentage of the root font-size. Every Tailwind text
 * utility in this app is set in `rem`, so scaling the root scales all of
 * them together — headings, labels, chips, the quote — instead of the one
 * element someone remembered to wire up.
 *
 * The two non-default percentages are round numbers, not a fresh
 * measurement. The exact ratio this switch had before it only reached the
 * quote — its three steps were hardcoded px on the blockquote alone, 15,
 * 17, 20 — works out to 88.2% and 117.6%. 80% and 120% land close to that
 * same jump without the odd fractions: reasoned, not re-measured, so
 * nobody has actually checked whether the rounder step reads better at
 * either extreme, only that 80/120 are easier to hold in your head.
 */
export const ROOT_SCALE: Record<TextSize, string> = {
  sm: "80%",
  md: "100%",
  lg: "120%",
};

export function isTextSize(value: unknown): value is TextSize {
  return (TEXT_SIZES as readonly string[]).includes(value as string);
}
