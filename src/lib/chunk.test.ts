import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

/**
 * A paragraph long enough to force chunk boundaries by itself (well over
 * `MAX_HEADING_LEN`, so it's never mistaken for a heading regardless of
 * wording) and tagged with a unique marker so a test can tell which
 * paragraph ended up in which chunk.
 */
function para(id: string, targetLen = 460): string {
  const filler =
    "the argument continues across the page in ordinary prose, one clause after another, ";
  let s = `[${id}] `;
  while (s.length < targetLen) s += filler;
  return s.slice(0, targetLen);
}

describe("chunkText — overlap at a chapter boundary", () => {
  // Four chapters of two ~460-character paragraphs each. Two paragraphs
  // cross TARGET_MIN (900) and trigger an internal flush partway through
  // each chapter, which leaves the second paragraph sitting in `buf` as
  // overlap — and the heading that opens the next chapter used to flush
  // that untouched overlap a second time, as its own chunk consisting of
  // nothing but a paragraph already inside the chunk before it.
  const chapters = [1, 2, 3, 4]
    .map((n) => `Chapter ${n}\n\n${para(`${n}A`)}\n\n${para(`${n}B`)}`)
    .join("\n\n");

  it("does not duplicate the overlap paragraph as its own chunk", () => {
    const chunks = chunkText(chapters, "en");
    // One chunk per chapter — not the eight a duplicate-per-boundary bug
    // would produce (four real chunks plus four one-paragraph copies).
    expect(chunks).toHaveLength(4);
    for (const c of chunks) {
      expect(c.text).toContain("A]");
      expect(c.text).toContain("B]");
    }
  });

  it("has no chunk whose text sits entirely inside its neighbor's", () => {
    const chunks = chunkText(chapters, "en");
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i - 1].text).not.toContain(chunks[i].text);
      expect(chunks[i].text).not.toContain(chunks[i - 1].text);
    }
  });

  it("does not leave a trailing chunk of just the last chapter's overlap", () => {
    // The end of the text is the same boundary as a heading, from the
    // overlap's point of view — nothing comes after chapter 4's last
    // paragraph to justify a fifth, single-paragraph chunk.
    const chunks = chunkText(chapters, "en");
    const last = chunks[chunks.length - 1];
    expect(last.text).toContain("4A]");
    expect(last.text).toContain("4B]");
  });
});

describe("chunkText — overlap within continuous prose", () => {
  // No headings at all: every boundary here comes from TARGET_MIN/TARGET_MAX
  // alone, the ordinary case the fix above must not disturb. Six paragraphs,
  // long enough that each internal flush leaves exactly one behind as
  // overlap for the next chunk.
  const paras = ["P1", "P2", "P3", "P4", "P5", "P6"]
    .map((id) => para(id))
    .join("\n\n");

  it("still carries one paragraph of overlap into the next chunk", () => {
    const chunks = chunkText(paras, "en");
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      // The chunk boundary is a paragraph break ("\n\n"), so the shared
      // overlap paragraph is the previous chunk's own last paragraph.
      const prevLastPara = chunks[i - 1].text.split("\n\n").pop()!;
      expect(chunks[i].text.startsWith(prevLastPara)).toBe(true);
    }
  });
});
