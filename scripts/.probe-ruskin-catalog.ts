/**
 * Which Ruskin works are in Gutenberg's catalog, and which were cut?
 *
 * The manifest has exactly 25 Ruskin works and PHILOSOPHY's cap is 25 — the selection
 * is ranked by ascending Gutenberg ID, so the list was cut in ID order. The question
 * is what lies above the cutoff, and only the catalog can answer that.
 */
import fs from "node:fs";
import path from "node:path";
import { CORPUS } from "../src/lib/corpus";

/** Quote-aware line reading — the titles contain both commas and line breaks. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(
  fs.readFileSync(path.join(process.cwd(), "data/cache/pg_catalog.csv"), "utf8"),
);
const header = rows[0];
const cId = header.indexOf("Text#");
const cTitle = header.indexOf("Title");
const cLang = header.indexOf("Language");
const cType = header.indexOf("Type");
const cAuth = header.indexOf("Authors");

const inManifest = new Set(
  CORPUS.filter((w) => w.author.includes("Ruskin")).map((w) => w.sourceId),
);

const ruskin = rows
  .slice(1)
  .filter(
    (r) =>
      r.length > cAuth &&
      r[cType] === "Text" &&
      r[cLang] === "en" &&
      /Ruskin, John, 1819/.test(r[cAuth]),
  )
  .map((r) => ({
    id: Number(r[cId]),
    title: r[cTitle].replace(/\s+/g, " ").trim(),
    authors: r[cAuth].replace(/\s+/g, " ").trim(),
  }))
  .sort((a, b) => a.id - b.id);

console.log("ID     manifest  titel");
for (const r of ruskin) {
  const solo = /^Ruskin, John, 1819-1900$/.test(r.authors) ? "" : "  [+medförf.]";
  console.log(
    `${String(r.id).padEnd(6)} ${inManifest.has(String(r.id)) ? "  ✓     " : "  ·     "} ` +
      `${r.title.slice(0, 92)}${solo}`,
  );
}
console.log(`\n${ruskin.length} engelska Ruskintexter i katalogen, ${inManifest.size} i manifestet`);
console.log(`taket för FILOSOFI är 25 — snittet går vid ID ${Math.max(
  ...[...inManifest].map(Number),
)}`);
