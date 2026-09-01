import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { SaveToProject } from "./SaveToProject";

/**
 * The path from a passage into a project. The menu reads
 * `listProjectsFor`/writes `toggleInProject`/`createProjectWith` — all three
 * server actions, stood in for by .storybook/mocks/actions.ts, which returns
 * an empty project list by default. Open the menu to see the create-project
 * field; the mock's `createProjectWith` always reports the new project as
 * held.
 */
const meta = {
  title: "Smart compositions/SaveToProject",
  component: SaveToProject,
  parameters: { layout: "centered" },
} satisfies Meta<typeof SaveToProject>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    chunkId: 10234,
    prompt: "What distinguishes Stoicism from Epicureanism?",
    relevance: "Öppnar Epiktetos hela system om det som står i vår makt.",
  },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Spara i projekt" });
    await userEvent.click(trigger);
    // The mocked `listProjectsFor` returns an empty list on every call.
    await expect(
      await canvas.findByText("Inga projekt ännu. Skriv ett namn för att skapa det första."),
    ).toBeInTheDocument();

    await userEvent.type(canvas.getByPlaceholderText("Nytt projekt…"), "Stoicism");
    await userEvent.click(canvas.getByRole("button", { name: "Skapa" }));

    // .storybook/mocks/actions.ts's `createProjectWith` always reports the
    // new project as held, so the trigger's label should flip accordingly.
    await expect(
      await canvas.findByRole("button", { name: "Sparat" }),
    ).toBeInTheDocument();
  },
};
