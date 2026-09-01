import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { EMPTY_COST, EMPTY_USAGE, type CostStats, type UsageStats } from "@/lib/stats";
import { CostsOverview } from "./CostsOverview";

const COST: CostStats = {
  byStep: [
    { key: "omrankning", cost: 0.08, tokens: 800 },
    { key: "frågeexpansion", cost: 0.05, tokens: 600 },
    { key: "översättning", cost: 0.02, tokens: 120 },
  ],
  byLine: [
    { key: "utmatning", cost: 0.09, tokens: 700 },
    { key: "inmatning", cost: 0.04, tokens: 600 },
    { key: "cacheläsning", cost: 0.015, tokens: 300 },
    { key: "cacheskrivning", cost: 0.005, tokens: 100 },
  ],
};

/** 8 saved searches, 5 of them on Claude — the other 3 exercise the local-search line. */
const USAGE: UsageStats = {
  searches: 8,
  claudeSearches: 5,
  spent: 0.32,
  reuses: 2,
  savedByCache: 0.05,
  projects: 2,
  savedPassages: 6,
  translations: 3,
  translationCost: 0.03,
};

/**
 * The bill summed across the whole archive, plus the three usage tiles
 * above it — the presentational half of `/kostnader`. `costs/page.tsx`
 * reads `costStats`/`usageStats`/`usdSek` (database and `process.env`) and
 * passes the results down; nothing here fetches anything, the same split
 * `ProjectView` makes from `projects/[slug]/page.tsx`.
 */
const meta = {
  title: "Smart compositions/CostsOverview",
  component: CostsOverview,
  parameters: { layout: "padded" },
  args: { locale: "sv", rate: 9.6 },
} satisfies Meta<typeof CostsOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { cost: COST, usage: USAGE },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("8 sparade sökningar")).toBeInTheDocument();
    // Of the 8, 5 ran on Claude — the other 3 are the local-search line.
    await expect(
      canvas.getByText("3 av dem lokala, kostar ingenting"),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/frågor fick ett gratis svar/)).toBeInTheDocument();

    await expect(canvas.getByText("2 projekt")).toBeInTheDocument();
    await expect(canvas.getByText("6 sparade stycken")).toBeInTheDocument();
    await expect(canvas.getByText("3 översatta stycken")).toBeInTheDocument();

    await expect(canvas.getByText("Totalt")).toBeInTheDocument();
    await expect(canvas.getByText("Per steg i kedjan")).toBeInTheDocument();
    await expect(canvas.getByText("Per posttyp")).toBeInTheDocument();
    // The biggest step by cost, first in the legend — `costStats` sorts descending.
    await expect(canvas.getByText("omrankning")).toBeInTheDocument();
    await expect(canvas.getByText("cacheskrivning")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { cost: EMPTY_COST, usage: EMPTY_USAGE },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Inga sökningar sparade ännu.")).toBeInTheDocument();
    await expect(canvas.getByText("Inga projekt ännu.")).toBeInTheDocument();
    await expect(
      canvas.getByText("Inga stycken översatta ännu."),
    ).toBeInTheDocument();
    // No `cost_detail` rows at all — the composition bars don't render, only the notice.
    await expect(canvas.getByText("Inga kostnader sparade ännu.")).toBeInTheDocument();
    await expect(canvas.queryByText("Totalt")).not.toBeInTheDocument();
  },
};
