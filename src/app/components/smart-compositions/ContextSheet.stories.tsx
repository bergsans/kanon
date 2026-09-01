import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, fn } from "storybook/test";
import { ContextSheet } from "./ContextSheet";
import { contextApiHandler } from "./storyFixtures";

/**
 * The surrounding chapter, opened over the answer. Always fetches on
 * mount — unlike MoreFromWork/SimilarPassages, there's no button state to
 * show first — so this story always needs the /api/context mock (see
 * storyFixtures.contextApiHandler).
 */
const meta = {
  title: "Smart compositions/ContextSheet",
  component: ContextSheet,
  parameters: {
    layout: "fullscreen",
    msw: { handlers: [contextApiHandler()] },
  },
  args: { chunkId: 10234, onClose: fn() },
} satisfies Meta<typeof ContextSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      await canvas.findByText("Epictetus, Encheiridion"),
    ).toBeInTheDocument();

    // The action row: a neighbor or a work-listing passage reaches this
    // panel with no other way to be saved or cited — see ContextSheet's
    // own comment on why it sits here rather than in the scrolling body.
    // The save flow itself (opening the menu, creating a project) is
    // SaveToProject's own story; this only checks the row is actually
    // wired up to the fetched passage, not reachable through here before.
    await expect(
      canvas.getByRole("button", { name: "Spara i projekt" }),
    ).toBeInTheDocument();
    const source = canvas.getByRole("link", { name: /Project Gutenberg/ });
    await expect(source).toHaveAttribute(
      "href",
      "https://www.gutenberg.org/ebooks/45109",
    );

    // The fixture's `atStart: true` means there's nothing before this
    // window — "Läs tidigare" shouldn't be offered at all.
    await expect(
      canvas.queryByRole("button", { name: /Läs tidigare/ }),
    ).not.toBeInTheDocument();

    const readOn = canvas.getByRole("button", { name: /Läs vidare/ });
    await userEvent.click(readOn);
    // Still the same fixture underneath, but a second /api/context round
    // trip really happened — the quoted passage should still be there once
    // it resolves.
    await expect(
      await canvas.findByText(/Of things some are in our power/),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Stäng" }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};
