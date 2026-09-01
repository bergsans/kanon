import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { HomeSearchShell } from "./HomeSearchShell";
import { AVAILABLE, searchApiHandler } from "./storyFixtures";

/**
 * The front page: masthead plus search session, as one client component —
 * see the file's own comment on why the two can't be independent. Submit a
 * question in the `Fresh` story to watch the masthead collapse into the
 * compact `PageHeader` every other page uses, the same transition
 * `onActiveChange` drives in the real app.
 */
const meta = {
  title: "Smart compositions/HomeSearchShell",
  component: HomeSearchShell,
  parameters: {
    layout: "fullscreen",
    msw: { handlers: [searchApiHandler()] },
  },
  args: { available: AVAILABLE },
} satisfies Meta<typeof HomeSearchShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fresh: Story = {
  args: { stats: { works: 2690, authors: 490, genres: 10 } },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Kanon", level: 1 }),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/författare/)).toBeInTheDocument();

    const field = await canvas.findByRole("textbox", { name: "Din fråga" });
    await userEvent.type(field, "What distinguishes Stoicism from Epicureanism?");
    await userEvent.click(canvas.getByRole("button", { name: "Sök" }));

    // `showResults` (phase !== "idle") flips the instant the search starts,
    // not when the mocked stream finishes — the masthead collapses before
    // any passage has actually come back.
    await expect(canvas.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /alla frågor/ })).toBeInTheDocument();
  },
};

export const NotYetIndexed: Story = {
  args: { stats: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/samlingen är inte indexerad ännu/),
    ).toBeInTheDocument();
    await expect(canvas.getByText("pnpm ingest")).toBeInTheDocument();
  },
};
