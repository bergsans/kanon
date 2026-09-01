import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import type { SearchSummary } from "@/lib/searches";
import { RecentSearches } from "./RecentSearches";

const SEARCHES: SearchSummary[] = [
  {
    slug: "stoicism-epicureanism",
    prompt: "What distinguishes Stoicism from Epicureanism?",
    filter: { genres: ["filosofi"], eras: ["antiken"] },
    createdAt: new Date().toISOString(),
    model: "claude-sonnet-5",
    passageCount: 14,
    cost: 0.1183,
  },
  {
    slug: "civilization-barbarism",
    prompt: "How does Gibbon's account of civilization's rise and fall differ from Tacitus's?",
    filter: { genres: [], eras: [] },
    createdAt: new Date().toISOString(),
    model: "claude-sonnet-5",
    passageCount: 12,
    cost: 0.0954,
  },
  {
    slug: "womens-status",
    prompt: "How is women's status portrayed in 19th-century prose?",
    filter: { genres: ["prosa"], eras: ["1800-tal"] },
    createdAt: new Date().toISOString(),
    model: "qwen3:30b",
    passageCount: 9,
    cost: 0,
  },
];

/**
 * The archive of past questions in the page's right margin — the second way
 * into the corpus, besides the search box. `forgetSearch` is a server
 * action, stood in for by .storybook/mocks/actions.ts: the trash icon on
 * hover removes the row optimistically either way.
 */
const meta = {
  title: "Smart compositions/RecentSearches",
  component: RecentSearches,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RecentSearches>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { searches: SEARCHES },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);

    const removeFirst = canvas.getByRole("button", {
      name: `Ta bort sökningen ”${SEARCHES[0].prompt}”`,
    });
    await userEvent.click(removeFirst);
    // Removed from the list immediately rather than waiting on
    // `forgetSearch`'s round trip — see the component's own comment.
    await expect(canvas.getAllByRole("listitem")).toHaveLength(2);
    await expect(
      canvas.queryByText(SEARCHES[0].prompt),
    ).not.toBeInTheDocument();
  },
};

export const CurrentSlugMarked: Story = {
  args: { searches: SEARCHES, currentSlug: SEARCHES[0].slug },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: SEARCHES[0].prompt }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      canvas.getByRole("link", { name: SEARCHES[1].prompt }),
    ).not.toHaveAttribute("aria-current");
  },
};

export const Empty: Story = {
  args: { searches: [] },
  play: async ({ canvas }) => {
    // No searches yet — the section renders nothing rather than an empty heading.
    await expect(canvas.queryByRole("heading")).not.toBeInTheDocument();
  },
};
