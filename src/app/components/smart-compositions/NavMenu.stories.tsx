import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, within } from "storybook/test";
import { NavMenu } from "./NavMenu";

/**
 * The hamburger menu fixed in the corner of every page: the five
 * destinations, plus the model and reranking-effort switches at the panel's
 * foot. `setProvider`/`setEffort` are server actions, stood in for by
 * .storybook/mocks/actions.ts — open the menu, then the model dropdown, to
 * see the mocked call logged to the Actions panel.
 *
 * Closed by default, the same as on first paint in the app — open it with
 * the hamburger button in the top-right of the canvas.
 */
const meta = {
  title: "Smart compositions/NavMenu",
  component: NavMenu,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NavMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Claude: Story = {
  args: { provider: "claude", effort: "medium" },
  play: async ({ canvas, userEvent }) => {
    // Closed on mount — the same as first paint in the real app.
    await expect(canvas.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "meny" }));
    const menu = await canvas.findByRole("menu", { name: "meny" });
    await expect(within(menu).getAllByRole("menuitem")).toHaveLength(5);
    await expect(
      within(menu).getByText("Tidigare sökningar"),
    ).toBeInTheDocument();
    await expect(within(menu).getByText("Kostnader")).toBeInTheDocument();

    await expect(
      canvas.getByRole("button", { name: "Claude" }),
    ).toBeInTheDocument();
    // Claude's own dial applies here, so no caveat title on the trigger.
    await expect(
      canvas.getByRole("button", { name: "Grundlig" }),
    ).not.toHaveAttribute("title");

    await userEvent.click(canvas.getByRole("button", { name: "stäng menyn" }));
    await expect(canvas.queryByRole("menu")).not.toBeInTheDocument();
  },
};

export const LocalModel: Story = {
  args: { provider: "qwen3:14b", effort: "low" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "meny" }));

    const modelTrigger = canvas.getByRole("button", { name: /qwen3:14b/ });
    await expect(modelTrigger).toHaveAttribute("title", "Experimentell: körs på din egen maskin, är långsammare och mindre träffsäker än Claude.");
    await userEvent.click(modelTrigger);
    await canvas.findByRole("listbox", { name: "Modell" });

    // The reranking dial only applies to Claude's call — a local model
    // carries the caveat as the trigger's own `title`, not just on hover
    // over the list.
    await expect(canvas.getByRole("button", { name: "Snabb" })).toHaveAttribute(
      "title",
      "Gäller bara Claudes omrankning — lokala modeller påverkas inte.",
    );
  },
};
