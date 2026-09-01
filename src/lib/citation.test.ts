import { describe, expect, it } from "vitest";
import { asMarkdown, reference, worksAsBibtex, type Citable } from "./citation";

function citable(overrides: Partial<Citable> = {}): Citable {
  return {
    workId: "w1",
    author: "Edward Gibbon",
    title: "The History of the Decline and Fall of the Roman Empire",
    translator: null,
    locator: "book 1, ch. 3",
    text: "…",
    source: "gutenberg",
    sourceUrl: "https://www.gutenberg.org/ebooks/25717",
    year: 1794,
    ...overrides,
  };
}

const FIXED_DATE = new Date("2026-01-15T00:00:00Z");

describe("reference / asMarkdown — Markdown title escaping", () => {
  it("escapes * and _ in the title so italics don't break", () => {
    const p = citable({ title: "The Cat * Sat_ on the Mat" });
    const ref = reference(p, { locale: "en", fetchedAt: FIXED_DATE });
    // The literal characters survive, just backslash-escaped — an
    // unescaped title would close the italics span early.
    expect(ref).toContain("*The Cat \\* Sat\\_ on the Mat*");
  });

  it("leaves an ordinary title untouched", () => {
    const p = citable({ title: "Leviathan" });
    const ref = reference(p, { locale: "en", fetchedAt: FIXED_DATE });
    expect(ref).toContain("*Leviathan*");
  });

  it("carries the escaped title through asMarkdown's block quote", () => {
    const p = citable({ title: "A * B", text: "quoted text" });
    const md = asMarkdown(p, { locale: "en", fetchedAt: FIXED_DATE });
    expect(md).toContain("*A \\* B*");
  });
});

describe("worksAsBibtex", () => {
  it("wraps a single-word name in double braces", () => {
    const bib = worksAsBibtex(
      [citable({ author: "Homer", workId: "w-homer" })],
      { locale: "en", fetchedAt: FIXED_DATE },
    );
    expect(bib).toContain("author = {{Homer}}");
  });

  it("wraps a name with a lowercase 'of' particle in double braces", () => {
    const bib = worksAsBibtex(
      [citable({ author: "Erasmus of Rotterdam", workId: "w-erasmus" })],
      { locale: "en", fetchedAt: FIXED_DATE },
    );
    // Without protection BibTeX reads "of" as a von particle and prints
    // "Rotterdam, Erasmus of" — double braces keep the name as one unit.
    expect(bib).toContain("author = {{Erasmus of Rotterdam}}");
  });

  it("leaves an ordinary two-word name single-braced", () => {
    const bib = worksAsBibtex([citable({ author: "Edward Gibbon" })], {
      locale: "en",
      fetchedAt: FIXED_DATE,
    });
    expect(bib).toContain("author = {Edward Gibbon}");
    expect(bib).not.toContain("author = {{Edward Gibbon}}");
  });

  it("strips LaTeX-special characters from prose fields", () => {
    const bib = worksAsBibtex(
      [citable({ title: "50% Off & Other #Essays_on_$Money" })],
      { locale: "en", fetchedAt: FIXED_DATE },
    );
    const titleLine = bib.split("\n").find((l) => l.startsWith("  title"));
    expect(titleLine).toBeDefined();
    // Pull out just what's between the field's braces — not the whole
    // line, which always has `{`/`}` as the format's own wrapper syntax —
    // so the check below is only against what `bibEscape` produced.
    const value = /^ {2}title = \{(.*)\},?$/.exec(titleLine!)?.[1];
    // None of the LaTeX-special characters survive…
    expect(value).not.toMatch(/[\\{}%&#_$]/);
    // …but the field is still recognizably the same title, letters intact.
    expect(value).toContain("Off");
    expect(value).toContain("Other");
    expect(value).toContain("Essays");
    expect(value).toContain("Money");
  });

  it("leaves the url field untouched, since %, & and # are meaningful there", () => {
    const bib = worksAsBibtex(
      [citable({ sourceUrl: "https://example.org/x?a=1&b=2%20c#frag" })],
      { locale: "en", fetchedAt: FIXED_DATE },
    );
    expect(bib).toContain("url = {https://example.org/x?a=1&b=2%20c#frag}");
  });
});
