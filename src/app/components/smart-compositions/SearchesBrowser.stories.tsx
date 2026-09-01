import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import type { SearchSummary } from "@/lib/searches";
import { SearchesBrowser } from "./SearchesBrowser";

const SEARCHES: SearchSummary[] = [
  {
    slug: "stoicism-epicureanism",
    prompt: "What distinguishes Stoicism from Epicureanism?",
    filter: { genres: ["filosofi"], eras: ["antiken"] },
    createdAt: "2026-09-10T12:00:00.000Z",
    model: "claude-sonnet-5",
    passageCount: 14,
    cost: 0.1183,
  },
  {
    slug: "civilization-barbarism",
    prompt: "Civilisation kontra barbari",
    filter: { genres: [], eras: [] },
    createdAt: "2026-09-08T09:30:00.000Z",
    model: "claude-sonnet-5",
    passageCount: 12,
    cost: 0.0954,
  },
  {
    slug: "womens-status-local",
    prompt: "How is women's status portrayed in 19th-century prose?",
    filter: { genres: ["prosa"], eras: ["1800-tal"] },
    createdAt: "2026-09-05T18:15:00.000Z",
    model: "qwen3:14b",
    passageCount: 6,
    cost: 0,
  },
];

/**
 * The whole archive `RecentSearches` only ever shows six rows of — text
 * filter on the question, chip filter on the model. `allSearches()` reads
 * every row server-side; this component only ever filters what it's given.
 */
const meta = {
  title: "Smart compositions/SearchesBrowser",
  component: SearchesBrowser,
  parameters: { layout: "padded" },
  args: { searches: SEARCHES },
} satisfies Meta<typeof SearchesBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 sparade sökningar")).toBeInTheDocument();
    // Newest first.
    const rows = canvas.getAllByRole("link");
    await expect(rows[0]).toHaveTextContent("Stoicism");
    await expect(rows[2]).toHaveTextContent("women's status");
    // A local model costs nothing — said plainly, not as a "$0" figure
    // sitting next to Claude's real prices as if it were one of them.
    await expect(canvas.getByText("kostar ingenting")).toBeInTheDocument();
  },
};

export const FilteredByText: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Filtrera sökningarna" }),
      "barbari",
    );
    await expect(canvas.getByText("1 sparad sökning")).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: /Civilisation kontra barbari/ }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText(/Stoicism/)).not.toBeInTheDocument();
  },
};

export const FilteredByModel: Story = {
  play: async ({ canvas, userEvent }) => {
    // Two distinct models in the fixture (claude-sonnet-5, qwen3:14b) is
    // enough to make the chip row appear at all — see its own
    // `modelOptions.length > 1` guard.
    await userEvent.click(canvas.getByRole("button", { name: "qwen3:14b" }));
    await expect(canvas.getByText("1 sparad sökning")).toBeInTheDocument();
    await expect(canvas.getByText(/19th-century prose/)).toBeInTheDocument();
  },
};
