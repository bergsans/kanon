/**
 * Underscores as italics — the pure half.
 *
 * Project Gutenberg's and Runeberg's plain-text editions carry italics as
 * `_like this_`; it's the only typography that survives in a plain text
 * file, and it carries all the way through into the chunks table and the
 * locators read out of chapter headings (`chunk.ts`). This half of the
 * logic has no JSX in it and is needed from `lib/citation.ts`, which must
 * not depend on `src/app/components/ui/` — the rendering half, `emphasized`
 * (which turns a match into `<em>`), stays in `ui/emphasis.tsx` and imports
 * `EMPHASIS` back from here rather than each keeping its own copy of the
 * pattern.
 */

/**
 * The pair must enclose at least one non-whitespace character, and the
 * underscores must not sit inside a word.
 *
 * The latter rule is what makes the pattern useful: `[^_]` also matches a
 * line break — italics often span a line ending in a verse or a wrapped
 * paragraph — and without the word boundaries, `snake_case_name` in a
 * scientific text would become italic text instead of its own name.
 */
export const EMPHASIS = /(?<![\p{L}\p{N}])_(?=\S)([^_]*\S)_(?![\p{L}\p{N}])/gu;

/**
 * Strips the emphasis underscores without italicizing.
 *
 * For the previews: the collapsed row's teaser and the neighbor list's row
 * are already set in italics or truncated mid-sentence, and a truncation
 * can cut a pair in half, leaving a lone underscore behind. There, silent
 * removal is the most honest option — the underscore is markup, never text.
 * Also used to clean a locator (`locator.ts`'s `cleanLocator`) and the
 * exported citations (`citation.ts`), neither of which render anything —
 * a `<em>` there would be lost the moment the text left the browser.
 */
export function stripEmphasis(text: string): string {
  return text.replace(EMPHASIS, "$1");
}
