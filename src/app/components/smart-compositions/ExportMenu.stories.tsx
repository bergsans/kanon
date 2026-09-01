import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { searchAsMarkdown } from "@/lib/citation";
import { ExportMenu } from "./ExportMenu";
import { PASSAGES } from "./storyFixtures";

/**
 * The way out of an answer: Markdown for the essay, BibTeX/RIS for a
 * reference manager. `markdown` is a function rather than a string so a
 * results list that was never opened never pays to build the export text —
 * see the component's own comment.
 */
const meta = {
  title: "Smart compositions/ExportMenu",
  component: ExportMenu,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ExportMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    filename: "What distinguishes Stoicism from Epicureanism?",
    passages: PASSAGES,
    markdown: (locale) =>
      searchAsMarkdown(
        "What distinguishes Stoicism from Epicureanism?",
        PASSAGES,
        { locale },
      ),
  },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Exportera" });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const menu = await canvas.findByRole("menu");
    await expect(canvas.getByRole("menuitem", { name: /Kopiera som Markdown/ })).toBeInTheDocument();
    await expect(canvas.getByRole("menuitem", { name: /Verken som BibTeX/ })).toBeInTheDocument();
    await expect(canvas.getByRole("menuitem", { name: /Verken som RIS/ })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("menuitem", { name: /Kopiera som Markdown/ }));
    await expect(menu).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    filename: "Empty search",
    passages: [],
    markdown: () => "",
  },
  play: async ({ canvas }) => {
    // Reranking selected nothing — there's nothing to export, so the
    // component renders null rather than a disabled button.
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};
