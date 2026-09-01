/**
 * Text retrieval from Projekt Runeberg.
 *
 * Runeberg fills the gaps Litteraturbanken leaves: Strindberg exists there
 * only in Samlade Verk, which is copyrighted, while Runeberg has the old
 * free editions. Works are distributed as one zip archive per title:
 *
 *   Metadata       title, author key, character encoding
 *   Articles.lst   chapter order and headings — "01|Stockholm i fågelperspektiv|"
 *   01.html …      the chapters, as HTML
 *   Pages/*.txt    raw OCR pages, in works that are only scanned
 *
 * Only the HTML chapters are used. The page files are unproofread OCR of
 * 19th-century print, with misreadings and hyphenation across page breaks;
 * indexing them would mean poisoning the search with text that looks like
 * Swedish but isn't.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "./db";
import { htmlToText } from "./html";
import { decodeText, readZip } from "./zip";
import type { CanonWork } from "./corpus";

/** Below this it's not a book but a title page — see `toText`. */
const MIN_TEXT_LENGTH = 5000;

export function archiveUrl(sourceId: string): string {
  return `https://runeberg.org/download.pl?mode=txtzip&work=${encodeURIComponent(sourceId)}`;
}

/** Fetches the archive, with a disk cache so a re-run doesn't hit Runeberg again. */
export async function fetchArchive(work: CanonWork): Promise<Map<string, Buffer>> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, `rb-${work.sourceId}.zip`);
  if (!fs.existsSync(cached)) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(archiveUrl(work.sourceId), {
      headers: { "User-Agent": "canon-indexer/0.1 (personal research project)" },
    });
    if (!res.ok) {
      throw new Error(`Runeberg ${work.sourceId} svarade ${res.status} ${res.statusText}`);
    }
    const body = Buffer.from(await res.arrayBuffer());
    // Runeberg answers 200 with an HTML page when the title key doesn't exist.
    if (body.subarray(0, 2).toString("latin1") !== "PK") {
      throw new Error(
        `Runeberg ${work.sourceId} svarade med något som inte är ett zip-arkiv — ` +
          `stämmer titelnyckeln?`,
      );
    }
    fs.writeFileSync(cached, body);
  }
  return readZip(fs.readFileSync(cached));
}

/** "TITLE: Röda rummet" → { title: "Röda rummet", … } */
function parseMetadata(files: Map<string, Buffer>): Record<string, string> {
  const raw = files.get("Metadata");
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const line of decodeText(raw).split("\n")) {
    const m = /^([A-Z_]+):\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Checks that the title key points to the work the manifest claims.
 *
 * Runeberg's keys are short and cryptic ("odenafven," "satschanda") and easy
 * to mistype; a silent bug here indexes a different book under the right name.
 */
export function verifyArchive(files: Map<string, Buffer>, work: CanonWork): void {
  const meta = parseMetadata(files);
  const title = (meta.TITLE ?? "").toLowerCase();
  const author = (meta.AUTHORKEY ?? "").toLowerCase();

  if (!title.includes(work.titleMatch)) {
    throw new Error(
      `Fel verk för ${work.id}: runeberg.org/${work.sourceId} har titeln ` +
        `"${meta.TITLE ?? "(saknas)"}", förväntade något som innehåller "${work.titleMatch}".`,
    );
  }
  if (work.authorMatch && !author.includes(work.authorMatch)) {
    throw new Error(
      `Fel verk för ${work.id}: runeberg.org/${work.sourceId} har författarnyckeln ` +
        `"${meta.AUTHORKEY ?? "(saknas)"}", förväntade "${work.authorMatch}".`,
    );
  }
}

/**
 * Assembles the work's chapters in Articles.lst order.
 *
 * Articles.lst is also the table of contents: its lines carry the chapter
 * headings. The HTML files the list doesn't mention are skipped — in the
 * scanned works it lists page ranges from the facsimile, and those lines
 * have no file behind them.
 */
export function toText(files: Map<string, Buffer>, work: CanonWork): string {
  const list = files.get("Articles.lst");
  if (!list) throw new Error(`${work.id}: arkivet saknar Articles.lst.`);

  const parts: string[] = [];
  for (const line of decodeText(list).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const key = trimmed.split("|")[0].trim();
    if (!key) continue;
    const file = files.get(`${key}.html`);
    if (!file) continue;
    const body = htmlToText(decodeText(file));
    if (body) parts.push(body);
  }

  const text = parts.join("\n\n");

  // A scanned work still has an index.html with a title page and preface, so
  // it doesn't come out empty — just absurdly short. The threshold
  // distinguishes that case from a real book; the shortest work in the
  // collection is a one-act play at ten thousand characters.
  if (text.length < MIN_TEXT_LENGTH) {
    throw new Error(
      `${work.id}: runeberg.org/${work.sourceId} gav bara ${text.length} tecken text — ` +
        `verket finns troligen bara som inskannade ocr-sidor och duger inte att indexera.`,
    );
  }
  return text;
}
