import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import type { LostPassage, SavedPassage } from "@/lib/projects";
import { ProjectView } from "./ProjectView";
import { contextApiHandler, PASSAGES, similarApiHandler, workApiHandler } from "./storyFixtures";

const ENTRIES: SavedPassage[] = [
  {
    passage: PASSAGES[0],
    prompt: "What distinguishes Stoicism from Epicureanism?",
    note: "The opening quote — good for the essay's introduction.",
    addedAt: new Date().toISOString(),
  },
  {
    passage: PASSAGES[1],
    prompt: "What distinguishes Stoicism from Epicureanism?",
    note: "",
    addedAt: new Date().toISOString(),
  },
];

/** One with a note worth keeping, one saved with neither a note nor a question attached. */
const LOST_ENTRIES: LostPassage[] = [
  {
    chunkId: 9001,
    prompt: "What distinguishes Stoicism from Epicureanism?",
    note: "A line worth quoting near the end — find it again before the deadline.",
    addedAt: new Date().toISOString(),
  },
  {
    chunkId: 9002,
    prompt: "",
    note: "",
    addedAt: new Date().toISOString(),
  },
];

/**
 * A project as a list — the same PassageAccordion the results list uses,
 * with a note field and a "remove from project" link inside each open row
 * instead of "spara". `dropFromProject`/`forgetProject`/`saveNote` are
 * server actions, stood in for by .storybook/mocks/actions.ts.
 */
const meta = {
  title: "Smart compositions/ProjectView",
  component: ProjectView,
  parameters: {
    layout: "padded",
    msw: { handlers: [contextApiHandler(), similarApiHandler(), workApiHandler()] },
  },
  args: {
    slug: "stoicism-spring26",
    title: "Stoicism, spring term '26",
    entries: ENTRIES,
  },
} satisfies Meta<typeof ProjectView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("2 stycken")).toBeInTheDocument();

    const first = canvas.getByRole("button", { name: /Epictetus, Encheiridion/ });
    await userEvent.click(first);
    await expect(canvas.getByText("ur frågan ”What distinguishes Stoicism from Epicureanism?”")).toBeInTheDocument();

    const note = canvas.getByPlaceholderText("Varför sparade du det här?");
    await expect(note).toHaveValue("The opening quote — good for the essay's introduction.");
    await userEvent.type(note, " (updated)");
    await userEvent.click(canvas.getByRole("button", { name: "Spara anteckningen" }));
    await expect(await canvas.findByText("Sparad")).toBeInTheDocument();

    // Removed from the list immediately — same optimistic pattern as
    // RecentSearches, and for the same reason.
    await userEvent.click(canvas.getByRole("button", { name: "Ta bort ur projektet" }));
    await expect(canvas.getByText("1 stycke")).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /Epictetus, Encheiridion/ }),
    ).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { entries: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Projektet är tomt. Spara ett stycke ur en träfflista, så hamnar det här."),
    ).toBeInTheDocument();
  },
};

/**
 * A re-index left two saved passages without text — see `LostPassage` in
 * projects.ts. Both rows start collapsed (`ProjectView` opens none by
 * default, unlike a results list), so the only "Ta bort ur projektet"
 * buttons in the DOM at first belong to these two, not to `ENTRIES`.
 */
export const WithLostPassages: Story = {
  args: { lostEntries: LOST_ENTRIES },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Förlorade stycken")).toBeInTheDocument();
    await expect(
      canvas.getByText("A line worth quoting near the end — find it again before the deadline."),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Ingen anteckning skriven.")).toBeInTheDocument();

    const removeButtons = canvas.getAllByRole("button", {
      name: "Ta bort ur projektet",
    });
    await expect(removeButtons).toHaveLength(2);
    await userEvent.click(removeButtons[1]);
    // Down to one — the heading itself switches to the singular form.
    await expect(canvas.getByText("Förlorat stycke")).toBeInTheDocument();
  },
};
