import { describe, expect, it } from "vitest";
import { eraOf } from "./era";

// Exact boundary values — this is the rule the seven other generators
// already agreed on, and `build-corpus.ts` (Gutenberg) used to use a
// different one (`<=`, and 1400/1600 instead of 1450/1650). Pinning every
// boundary here means a future edit that reintroduces that drift fails a
// test instead of silently filing Shakespeare under "upplysning" again.
describe("eraOf", () => {
  it("antiken: strictly before 500", () => {
    expect(eraOf(499)).toBe("antiken");
    expect(eraOf(500)).toBe("medeltid");
  });

  it("medeltid: 500 up to (not including) 1450", () => {
    expect(eraOf(500)).toBe("medeltid");
    expect(eraOf(1449)).toBe("medeltid");
    expect(eraOf(1450)).toBe("renässans");
  });

  it("renässans: 1450 up to (not including) 1650 — Shakespeare and Cervantes, both d. 1616", () => {
    expect(eraOf(1450)).toBe("renässans");
    expect(eraOf(1616)).toBe("renässans");
    expect(eraOf(1649)).toBe("renässans");
    expect(eraOf(1650)).toBe("upplysning");
  });

  it("upplysning: 1650 up to (not including) 1800", () => {
    expect(eraOf(1650)).toBe("upplysning");
    expect(eraOf(1799)).toBe("upplysning");
    expect(eraOf(1800)).toBe("1800-tal");
  });

  it("1800-tal: 1800 up to (not including) 1900", () => {
    expect(eraOf(1800)).toBe("1800-tal");
    expect(eraOf(1899)).toBe("1800-tal");
    expect(eraOf(1900)).toBe("1900-tal");
  });

  it("1900-tal: 1900 and later", () => {
    expect(eraOf(1900)).toBe("1900-tal");
    expect(eraOf(2020)).toBe("1900-tal");
  });
});
