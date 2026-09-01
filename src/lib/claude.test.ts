import { describe, expect, it } from "vitest";
import { parseQueryPlan, parseRerankSelection } from "./claude";
import type { Candidate } from "./search";

/**
 * Regression tests for the two "liberal by design" JSON parsers a local
 * model's structured output can violate — see each function's own comment.
 * Both used to assume the top-level JSON value was an object; `"null"` is
 * valid JSON and isn't one, and threw a TypeError instead of falling back.
 */

describe("parseQueryPlan", () => {
  it("falls back to defaults for every shape of non-object JSON", () => {
    for (const raw of ["null", "42", "[]", '"a string"']) {
      const plan = parseQueryPlan(raw, "en fråga");
      expect(plan.inScope).toBe(true);
      expect(plan.queries.sv).toBe("en fråga");
      expect(plan.hypotheticalPassages).toEqual([]);
      expect(plan.keywords).toEqual([]);
      expect(plan.mentions).toEqual([]);
    }
  });

  it("reads a well-formed plan", () => {
    const plan = parseQueryPlan(
      JSON.stringify({
        inScope: true,
        restatement: "vad menar Hobbes med naturtillstånd",
        queries: { en: "the state of nature" },
        hypotheticalPassages: ["a passage", "  ", "another"],
        languagePassages: {},
        keywords: ["leviathan", 42, "war of all against all"],
        mentions: ["Hobbes"],
      }),
      "vad är naturtillståndet",
    );
    expect(plan.inScope).toBe(true);
    expect(plan.queries.en).toBe("the state of nature");
    // Swedish always comes from the prompt itself, never from the model.
    expect(plan.queries.sv).toBe("vad är naturtillståndet");
    // Blank passages are dropped, not kept as empty branches.
    expect(plan.hypotheticalPassages).toEqual(["a passage", "another"]);
    // A non-string keyword is filtered out rather than crashing `toFtsQuery`.
    expect(plan.keywords).toEqual(["leviathan", "war of all against all"]);
    expect(plan.mentions).toEqual(["Hobbes"]);
  });

  it("falls back to true when inScope is missing or malformed", () => {
    const plan = parseQueryPlan(JSON.stringify({ inScope: "yes" }), "fråga");
    expect(plan.inScope).toBe(true);
  });
});

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    chunkId: 1,
    workId: "w1",
    author: "Hobbes",
    title: "Leviathan",
    genre: "philosophy",
    language: "en",
    locator: null,
    text: "…",
    charStart: 0,
    charEnd: 10,
    score: 1,
    sources: ["vector"],
    ...overrides,
  } as Candidate;
}

describe("parseRerankSelection", () => {
  it("falls back to an empty list for every shape of non-object JSON", () => {
    const candidates = [candidate()];
    for (const raw of ["null", "42", "[]", '"x"']) {
      expect(parseRerankSelection(raw, candidates)).toEqual([]);
    }
  });

  it("drops entries with a non-numeric id or an empty relevance", () => {
    const candidates = [candidate({ chunkId: 1 }), candidate({ chunkId: 2 })];
    const selected = parseRerankSelection(
      JSON.stringify({
        selected: [
          { id: 1, relevance: "svarar på frågan" },
          { id: "2", relevance: "borde inte räknas — id är en sträng" },
          { id: 2, relevance: "" },
          { id: 2, relevance: "   " },
        ],
      }),
      candidates,
    );
    // Only the one well-formed entry survives, renumbered from 1.
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ chunkId: 1, index: 1 });
  });

  it("drops an id outside the candidate list and a repeated id", () => {
    const candidates = [candidate({ chunkId: 1 })];
    const selected = parseRerankSelection(
      JSON.stringify({
        selected: [
          { id: 1, relevance: "först" },
          { id: 1, relevance: "samma kort igen" },
          { id: 99, relevance: "finns inte" },
        ],
      }),
      candidates,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].relevance).toBe("först");
  });
});
