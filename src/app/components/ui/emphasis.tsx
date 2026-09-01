import { Fragment, type ReactNode } from "react";
import { EMPHASIS, stripEmphasis } from "@/lib/emphasis";

// `stripEmphasis` re-exported from here: every existing importer of this
// module reached it through this path, and the pure half now lives in
// `@/lib/emphasis` only because `citation.ts` needed it and must not depend
// on `src/app/components/ui/` — that move shouldn't have to ripple through
// every call site that only ever wanted the string function.
export { stripEmphasis };

/**
 * The text with `_emphasis_` rendered as `<em>`.
 *
 * A pair that doesn't match up is left as is. This happens in the context
 * view, which renders the text before, in, and after the passage as three
 * separate strings so the quoted section can be highlighted — italics that
 * start in one segment and end in another can't be paired, and then a
 * visible underscore is better than a guess at where the emphasis ended.
 */
export function emphasized(text: string): ReactNode {
  // Keyed by each segment's start offset rather than its position in the
  // array: the offset is unique and stable across re-renders of the same
  // text, unlike an index, which two adjacent segments could swap under an
  // edit to the regex above.
  const parts: { start: number; node: ReactNode }[] = [];
  let cursor = 0;

  // The pattern is global and therefore carries a `lastIndex` between
  // calls — it must be reset here, or the next passage would start being
  // read where the previous one left off.
  EMPHASIS.lastIndex = 0;
  for (let m = EMPHASIS.exec(text); m; m = EMPHASIS.exec(text)) {
    if (m.index > cursor) {
      parts.push({ start: cursor, node: text.slice(cursor, m.index) });
    }
    parts.push({ start: m.index, node: <em>{m[1]}</em> });
    cursor = m.index + m[0].length;
  }

  // No emphasis at all — the common case — should return the string as it
  // came, not a one-element list for React to diff on every re-render.
  if (parts.length === 0) return text;

  if (cursor < text.length) parts.push({ start: cursor, node: text.slice(cursor) });
  return parts.map(({ start, node }) => <Fragment key={start}>{node}</Fragment>);
}
