/**
 * HTML to plain text.
 *
 * Two of the collection's sources distribute HTML instead of text — Projekt
 * Runeberg and Marxists Internet Archive — and both need the same thing: the
 * body text, with paragraph boundaries intact and headings in a form
 * chunking recognizes.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aring: "å",
  auml: "ä",
  ouml: "ö",
  Aring: "Å",
  Auml: "Ä",
  Ouml: "Ö",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  uuml: "ü",
  oslash: "ø",
  aelig: "æ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  deg: "°",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/** Tags removed, text kept — without a tag's contents getting glued into one word. */
export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turns an HTML document into plain text.
 *
 * Headings are uppercased. Chunking recognizes a heading by its being short
 * and standing alone in capitals — that's how printed editions set them, and
 * it's the form Gutenberg's and Litteraturbanken's files already have.
 * Runeberg and MIA instead mark them up structurally, with <h2> and <h3>,
 * and a chapter heading in lowercase would silently pass as body text: the
 * work would be searchable but the passages would lack a reference.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, inner: string) => {
      const heading = stripTags(inner);
      return heading ? `\n\n${heading.toUpperCase()}\n\n` : "\n\n";
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/?(p|div|blockquote|li|ul|ol|tr|table|center|pre|dd|dt|dl)\b[^>]*>/gi,
      "\n\n",
    )
    // Runeberg's own pseudo-tag for indentation in dialogue and verse.
    .replace(/<tab>/gi, "")
    .replace(/<[^>]*>/g, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
