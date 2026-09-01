import { describe, expect, it } from "vitest";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTags, parseTags } from "./tags";

describe("normalizeTags", () => {
  it("strips commas, since storage is comma-separated", () => {
    // Without the strip, "a,b" typed as one tag round-trips through
    // `parseTags` as two — see the comment in tags.ts.
    expect(normalizeTags(["a,b"])).toEqual(["ab"]);
  });

  it("trims, caps length, and drops empties", () => {
    const long = "x".repeat(MAX_TAG_LENGTH + 10);
    expect(normalizeTags(["  stoicism  ", "", "   ", long])).toEqual([
      "stoicism",
      "x".repeat(MAX_TAG_LENGTH),
    ]);
  });

  it("deduplicates case-insensitively, keeping the first spelling", () => {
    expect(normalizeTags(["Stoicism", "stoicism", "STOICISM"])).toEqual([
      "Stoicism",
    ]);
  });

  it("caps the list at MAX_TAGS", () => {
    const many = Array.from({ length: MAX_TAGS + 5 }, (_, i) => `t${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
  });
});

describe("parseTags / normalizeTags round-trip", () => {
  it("a normalized tag survives being stored and re-read", () => {
    const stored = normalizeTags(["a,b", "stoicism"]).join(",");
    expect(parseTags(stored)).toEqual(["ab", "stoicism"]);
  });
});
