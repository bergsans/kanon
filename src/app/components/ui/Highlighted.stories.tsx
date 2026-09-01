import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { Highlighted } from "./Highlighted";

/**
 * The three cases `highlightRanges` (`@/lib/fuzzy`) actually produces:
 * nothing to mark, one match, and two matches that touch and merge into a
 * single `<mark>` rather than two overlapping ones. `CorpusBrowser` and
 * `SearchesBrowser` are its two callers, both filtering a list of running
 * text against typed words — this pins down the shared piece directly
 * instead of relying on either caller's own story to cover it incidentally.
 */
const meta = {
  title: "Pure Components/Highlighted",
  component: Highlighted,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Highlighted>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoMatch: Story = {
  args: { text: "Søren Kierkegaard", terms: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Søren Kierkegaard")).toBeInTheDocument();
    await expect(
      canvas.queryByText((_, el) => el?.tagName === "MARK"),
    ).not.toBeInTheDocument();
  },
};

export const SingleMatch: Story = {
  args: { text: "Søren Kierkegaard", terms: ["kierke"] },
  play: async ({ canvas }) => {
    const mark = canvas.getByText("Kierke");
    await expect(mark.tagName).toBe("MARK");
    // The rest of the name is still there, just not inside the mark.
    await expect(canvas.getByText(/gaard/)).toBeInTheDocument();
  },
};

/**
 * "kier" ends exactly where "kegaard" begins — `highlightRanges`' own merge
 * step (`range.start <= last.end`) folds the two into one range rather than
 * two `<mark>`s sharing a boundary, which would nest one Fragment's text
 * inside another and read as a rendering bug, not a filter match.
 */
export const AdjacentMatches: Story = {
  args: { text: "Kierkegaard", terms: ["kier", "kegaard"] },
  play: async ({ canvas }) => {
    const marks = canvas.getAllByText((_, el) => el?.tagName === "MARK");
    await expect(marks).toHaveLength(1);
    await expect(marks[0]).toHaveTextContent("Kierkegaard");
  },
};
