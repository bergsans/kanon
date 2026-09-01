/**
 * Shared display helpers for the passage rows.
 *
 * First lived in `PassageAccordion` and was then also needed in the
 * neighbor list. Importing them from there would have made the dependency
 * circular — the accordion renders the neighbor list — so they live here
 * instead.
 */

import { stripEmphasis } from "@/lib/emphasis";
import type { Locale } from "@/lib/i18n";
import { cleanLocator } from "@/lib/locator";

/** Chapter headings from The Prince are whole sentences — shorten them in the header. */
export function shortLocator(locator: string): string {
  const clean = cleanLocator(locator);
  return clean.length > 44 ? `${clean.slice(0, 42).trimEnd()}…` : clean;
}

/**
 * The quotation marks are the interface language's, not the corpus's.
 *
 * Swedish sets both marks high, English flips the opening one — the row is
 * set in the UI's typography and should follow it, not the quoted text's.
 */
const QUOTES: Record<Locale, [string, string]> = {
  sv: ["”", "”"],
  en: ["“", "”"],
};

/**
 * A line from the passage itself, as a preview.
 *
 * Line breaks are flattened: this should read as one line, not three words
 * across four. Emphasis underscores are stripped without italicizing — the
 * line is already set in italics, and truncation can cut a `_pair_` in
 * half, leaving a lone underscore in the middle of a sentence.
 */
export function quoted(text: string, locale: Locale, max = 150): string {
  const [open, close] = QUOTES[locale];
  const flat = stripEmphasis(text).replace(/\s+/g, " ").trim();
  return flat.length > max
    ? `${open}${flat.slice(0, max - 2).trimEnd()}…${close}`
    : `${open}${flat}${close}`;
}
