import { describe, expect, it } from "vitest";
import { tagText } from "./tei";

describe("tagText", () => {
  it("extracts the text content of a tag, tags stripped", () => {
    expect(tagText("<title>Leviathan</title>", "title")).toBe("Leviathan");
  });

  it("replaces a nested tag with a space and collapses whitespace", () => {
    // Each stripped tag becomes a space, not nothing — a tag boundary
    // should never glue two words together that weren't adjacent in the
    // rendered text.
    const xml = "<title>The <hi>Leviathan</hi>,\n  or  the Matter</title>";
    expect(tagText(xml, "title")).toBe("The Leviathan , or the Matter");
  });

  it("decodes entities", () => {
    expect(tagText("<author>Rold&#233; &amp; Co</author>", "author")).toBe(
      "Roldé & Co",
    );
  });

  it("matches attributes on the opening tag", () => {
    expect(tagText('<date when="1651">1651</date>', "date")).toBe("1651");
  });

  it("returns null when the tag isn't present", () => {
    expect(tagText("<title>Leviathan</title>", "author")).toBeNull();
  });

  it("is case-insensitive on the tag name", () => {
    expect(tagText("<TITLE>Leviathan</TITLE>", "title")).toBe("Leviathan");
  });
});
