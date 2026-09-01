/**
 * Text retrieval from Litteraturbanken.
 *
 * Litteraturbanken publishes proofread editions of the Swedish canon, and
 * hands them out as plain text via the same download path the button on the
 * site uses: POST /api/download with `files=<lbworkid>-etext-txt`.
 *
 * The files open with a metadata header — title, author, the edition's
 * origin, rights information — set off from the work by a line of dashes.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "./db";
import type { CanonWork } from "./corpus";

const DOWNLOAD_URL = "https://litteraturbanken.se/api/download";

/** The line of dashes separating Litteraturbanken's header from the work. */
const HEADER_RULE = /^-{20,}$/m;

/**
 * Fetches the raw text, with a disk cache so a re-run doesn't hit
 * Litteraturbanken again.
 */
export async function fetchRaw(work: CanonWork): Promise<string> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, `${work.sourceId}.txt`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");

  // Same courtesy as toward Gutenberg: a pause between fetches. The disk
  // cache makes it happen only once per work.
  await new Promise((r) => setTimeout(r, 1000));

  const res = await fetch(DOWNLOAD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "canon-indexer/0.1 (personal research project)",
    },
    body: new URLSearchParams({ files: `${work.sourceId}-etext-txt` }).toString(),
  });
  if (!res.ok) {
    throw new Error(
      `Litteraturbanken ${work.sourceId} svarade ${res.status} ${res.statusText}`,
    );
  }
  const body = await res.text();
  fs.writeFileSync(cached, body, "utf8");
  return body;
}

/**
 * Checks that lbworkid points to the work the manifest claims — and that the
 * edition is actually free.
 *
 * Litteraturbanken publishes both freely licensed editions and ones that are
 * copyrighted and explicitly must not be distributed (Strindberg's Samlade
 * Verk, Vitterhetssamfundet's Almqvist). The generator only picks cc-0, but
 * that check sits in a script that runs once; this one sits in the way every
 * single time a text is actually fetched. A protected work must never reach
 * the index because of a hand-edited manifest.
 */
export function verifyHeader(raw: string, work: CanonWork): void {
  const rule = HEADER_RULE.exec(raw);
  const header = raw.slice(0, rule ? rule.index : 2000).replace(/\r/g, "");
  const lines = header.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] ?? "").toLowerCase();
  const author = (lines[1] ?? "").toLowerCase();

  const rights = /^Rättighetsinformation:\s*(.+)$/m.exec(header)?.[1]?.trim() ?? "";
  if (!/^cc/i.test(rights)) {
    throw new Error(
      `${work.id}: Litteraturbanken anger rättigheterna som "${rights || "(saknas)"}" — ` +
        `bara fritt licensierade utgåvor (CC) får indexeras.`,
    );
  }

  if (!title.includes(work.titleMatch)) {
    throw new Error(
      `Fel utgåva för ${work.id}: ${work.sourceId} har titeln "${lines[0]}", ` +
        `förväntade något som innehåller "${work.titleMatch}".`,
    );
  }
  if (work.authorMatch && !author.includes(work.authorMatch)) {
    throw new Error(
      `Fel utgåva för ${work.id}: ${work.sourceId} har författaren "${lines[1]}", ` +
        `förväntade något som innehåller "${work.authorMatch}".`,
    );
  }
}

/**
 * Strips the metadata header and normalizes whitespace.
 *
 * Character offsets in the database point into what's returned here, so
 * this string is the one saved to disk.
 */
export function stripBoilerplate(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rule = HEADER_RULE.exec(text);
  if (rule) text = text.slice(rule.index + rule[0].length);

  return (
    text
      // Litteraturbanken marks images in the running text. They aren't
      // paragraphs, and otherwise they break up the title page into a
      // series of short heading candidates instead of the block chunking
      // recognizes as front matter.
      .replace(/^\[bild\]$/gm, "")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
