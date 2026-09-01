import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("splits plain fields and rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    expect(parseCsv('a,"b, still b",c\n')).toEqual([["a", "b, still b", "c"]]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsv('a,"she said ""hi""",c\n')).toEqual([
      ["a", 'she said "hi"', "c"],
    ]);
  });

  it("strips a trailing carriage return (CRLF line endings)", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("includes a final row with no trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
