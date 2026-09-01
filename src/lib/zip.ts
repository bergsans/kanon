/**
 * Minimal zip reader.
 *
 * Projekt Runeberg only distributes a work as a zip archive — the individual
 * files (`Metadata`, `Articles.lst`, the chapters' HTML) each answer 404 on
 * their own, and the chapter pages on the web are baked into the site's
 * template. One archive per work is also one request instead of twenty
 * against a free service.
 *
 * Node has no built-in zip reading, but `zlib.inflateRawSync` does all the
 * heavy lifting: the rest is finding the files in the central directory. The
 * archives are small and simple — no zip64, no encryption — so one more
 * dependency for sixty lines would be a bad trade.
 */
import zlib from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

const STORED = 0;
const DEFLATED = 8;

/** The end record sits last in the file, but can be followed by up to 64 KB of comment. */
function findEndOfCentralDirectory(buf: Buffer): number {
  const from = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("Inte ett zip-arkiv: hittade ingen central katalog.");
}

/**
 * Unpacks the whole archive into a map from filename to content.
 *
 * The archives are at most a couple of megabytes, so everything is read
 * into memory — streaming out of them would only make the call site harder
 * to read.
 */
export function readZip(buf: Buffer): Map<string, Buffer> {
  const eocd = findEndOfCentralDirectory(buf);
  const total = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const files = new Map<string, Buffer>();

  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIG) {
      throw new Error(`Trasig central katalog vid post ${i + 1}.`);
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    // Runeberg's filenames are plain ASCII; latin1 can't throw and is therefore good enough.
    const name = buf.toString("latin1", offset + 46, offset + 46 + nameLength);

    // The local record has its own lengths for name and extra field — they
    // don't need to match the central directory's, and the data starts after them.
    if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new Error(`Trasig lokal post för ${name}.`);
    }
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buf.subarray(dataStart, dataStart + compressedSize);

    if (!name.endsWith("/")) {
      if (method === STORED) files.set(name, Buffer.from(data));
      else if (method === DEFLATED) files.set(name, zlib.inflateRawSync(data));
      else throw new Error(`${name} är packad med metod ${method}, som inte stöds.`);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

/**
 * Decodes a file from the archive.
 *
 * Runeberg's `Metadata` claims `CHARSET: utf-8` even for works whose files
 * are latin-1 — the field describes the text files, not the metadata file
 * itself, and isn't always accurate even then. Trying strict utf-8 and
 * falling back to latin-1 is both simpler and more reliable than trusting
 * the declaration: a byte sequence that's valid utf-8 is almost never
 * latin-1 by accident.
 */
export function decodeText(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return buf.toString("latin1");
  }
}
