/**
 * A minimal CSV parser — quoted fields, doubled-quote escaping, CRLF or LF
 * line endings — shared by the three generators that read a CSV catalog
 * (Gutenberg's own, and TCP's). No external dependency: the format each
 * catalog actually uses is simple enough that a proper RFC 4180 parser
 * would buy correctness nobody has ever needed here.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
