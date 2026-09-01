"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { highlightRanges } from "@/lib/fuzzy";

/**
 * Text with the matching search words underlined in the accent color.
 *
 * Only substring matches have a position to draw — see `highlightRanges` —
 * so a hit the filter only found through the fuzzy margin in `fuzzy.ts`
 * appears unmarked rather than guessing where the match was.
 *
 * First lived only in `CorpusBrowser`; moved here once `SearchesBrowser`
 * needed the identical treatment for the same reason a name or a title
 * does — both are filtering a list of running text against typed words.
 */
export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const ranges = useMemo(() => highlightRanges(text, terms), [text, terms]);
  if (ranges.length === 0) return <>{text}</>;

  // Keyed by each segment's start offset, not its position in the array —
  // stable across re-renders, unlike an index the filter could reorder.
  const parts: { start: number; node: ReactNode }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push({ start: cursor, node: text.slice(cursor, range.start) });
    }
    parts.push({
      start: range.start,
      node: (
        <mark className="rounded-sm bg-accent-600/20 px-0.5 text-ink-900">
          {text.slice(range.start, range.end)}
        </mark>
      ),
    });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push({ start: cursor, node: text.slice(cursor) });
  return parts.map(({ start, node }) => <Fragment key={start}>{node}</Fragment>);
}
