/**
 * The one piece of TEI/XML handling shared by the three sources that
 * ingest it — Perseus, TCP, and DTA. Each of them parses a different
 * dialect of TEI for everything else (their headers, apparatus, and
 * front-matter conventions all differ), but pulling the text out of one
 * named tag is the same operation everywhere, and the three copies had
 * already drifted into being byte-identical without anyone noticing.
 */

import { decodeEntities } from "./html";

/**
 * The text content of the first `<tag>…</tag>` in `xml`, tags stripped and
 * entities decoded — or `null` if the tag isn't there.
 *
 * A regex, not a real XML parser: these headers are small, well-formed
 * enough in practice, and a dependency-free scan is what all three sources
 * already relied on before this was pulled out into one place.
 */
export function tagText(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return m
    ? decodeEntities(m[1].replace(/<[^>]*>/g, " "))
        .replace(/\s+/g, " ")
        .trim()
    : null;
}
