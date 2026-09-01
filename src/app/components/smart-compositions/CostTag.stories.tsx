import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, within } from "storybook/test";
import { CostTag } from "./CostTag";
import { COST } from "./storyFixtures";

/**
 * The dollar-and-krona line next to every answer, with the per-call
 * breakdown a click away. `usd`/`originalUsd` are kept apart on purpose —
 * see the `Cached` story — and `CostBreakdown`'s table only exists for the
 * `WithLines` case: a search saved before the breakdown existed has a total
 * but no `lines`.
 */
const meta = {
  title: "Smart compositions/CostTag",
  component: CostTag,
  parameters: { layout: "centered" },
} satisfies Meta<typeof CostTag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLines: Story = {
  args: { cost: COST },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Vad frågan kostade/ }),
    );
    const dialog = await canvas.findByRole("dialog", { name: "Vad frågan kostade" });
    await expect(dialog).toBeInTheDocument();
    // Both step headings from COST should appear in the breakdown table.
    await expect(within(dialog).getByText("frågeexpansion")).toBeInTheDocument();
    await expect(within(dialog).getByText("omrankning")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Stäng" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const Cached: Story = {
  args: { cost: { ...COST, usd: 0, cached: true } },
  play: async ({ canvas }) => {
    // The archive hit costs nothing now, but the original price still shows
    // — see the component's own comment on why both numbers are kept.
    await expect(canvas.getByText("· ur arkivet")).toBeInTheDocument();
  },
};

export const NoBreakdown: Story = {
  args: { cost: { ...COST, steps: [], usd: 0.0183, originalUsd: 0.0183 } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Vad frågan kostade/ }));
    const dialog = await canvas.findByRole("dialog");
    // A search saved before the breakdown existed has a total but no line
    // items — the table shouldn't render at all, only the explanatory line.
    await expect(within(dialog).queryByRole("table")).not.toBeInTheDocument();
  },
};

export const Translation: Story = {
  args: {
    subject: "translation",
    cost: {
      model: "claude-sonnet-5",
      usd: 0.0091,
      originalUsd: 0.0091,
      rate: 9.6,
      cached: false,
      steps: [
        {
          step: "översättning",
          model: "claude-sonnet-5",
          cost: 0.0091,
          lines: [
            { label: "inmatning", tokens: 340, perMillion: 3, cost: 0.001 },
            { label: "utmatning", tokens: 540, perMillion: 15, cost: 0.0081 },
          ],
        },
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Vad översättningen kostade/ }),
    );
    await expect(
      await canvas.findByRole("dialog", { name: "Vad översättningen kostade" }),
    ).toBeInTheDocument();
  },
};
