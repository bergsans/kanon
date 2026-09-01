import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { ProjectHeader } from "./ProjectHeader";

/**
 * Title, description and tags on a project's own page — editable in place.
 * `editProject` is a server action, stood in for by
 * .storybook/mocks/actions.ts; click "Redigera", change a field, and "Spara"
 * logs the mocked call to the Actions panel instead of writing to SQLite.
 */
const meta = {
  title: "Smart compositions/ProjectHeader",
  component: ProjectHeader,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ProjectHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    slug: "stoicism-spring26",
    title: "Stoicism, spring term '26",
    description: "Groundwork for the essay on Stoicism's view of the passions.",
    tags: ["filosofi", "antiken", "essay"],
    existingTags: ["filosofi", "antiken", "essay", "etik", "retorik"],
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Stoicism, spring term '26" }),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Redigera" }));
    const title = canvas.getByPlaceholderText("Projektets namn");
    await userEvent.clear(title);
    await userEvent.type(title, "Stoicism, revised");
    await userEvent.click(canvas.getByRole("button", { name: "Spara" }));

    // .storybook/mocks/actions.ts's `editProject` echoes back exactly what
    // was submitted, so a successful save should show the new title as the
    // heading again — the same round trip the real server action makes.
    await expect(
      await canvas.findByRole("heading", { name: "Stoicism, revised" }),
    ).toBeInTheDocument();
  },
};

export const Untitled: Story = {
  args: {
    slug: "new-project",
    title: "Untitled project",
    description: "",
    tags: [],
    existingTags: ["filosofi", "antiken", "essay"],
  },
};
