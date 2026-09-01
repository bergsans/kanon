import { describe, expect, it, vi } from "vitest";
import { assertNoDuplicateIds } from "./manifest";

describe("assertNoDuplicateIds", () => {
  it("passes silently when every id is unique", () => {
    expect(() =>
      assertNoDuplicateIds([
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ]),
    ).not.toThrow();
  });

  it("reports both titles and stops the run on a collision", () => {
    // `process.exit` really does exit the process — even under a mock it
    // doesn't return, so the exit call itself has to be what the test
    // observes, not a return value or a thrown error from the function.
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      assertNoDuplicateIds([
        { id: "montaigne", title: "Essays, Volume I" },
        { id: "montaigne", title: "Essays, Volume II" },
      ]),
    ).toThrow("process.exit called");

    expect(exit).toHaveBeenCalledWith(1);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("Essays, Volume I"),
    );
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("Essays, Volume II"),
    );

    exit.mockRestore();
    errorLog.mockRestore();
  });
});
