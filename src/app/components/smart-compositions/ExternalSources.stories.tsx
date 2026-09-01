import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { ExternalSources } from "./ExternalSources";
import { EXTERNAL_HITS } from "./storyFixtures";

/**
 * The "utanför samlingen" checkbox's own result — see `findExternal` in
 * claude.ts. Never a passage: a pointer (author, title, link, rationale)
 * to a page the collection's rights checks keep out, e.g. most of
 * Kollontai's and Luxemburg's Marxists Internet Archive articles.
 */
const meta = {
  title: "Smart compositions/ExternalSources",
  component: ExternalSources,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ExternalSources>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Found: Story = {
  args: {
    hits: EXTERNAL_HITS,
    loading: false,
    cost: { usd: 0.0284, rate: 9.62 },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", {
        name: "Alexandra Kollontai, Communism and the Family",
      }),
    ).toHaveAttribute(
      "href",
      "https://www.marxists.org/archive/kollontai/1920/communism-family.htm",
    );
    await expect(canvas.getByText(/Extern sökning/)).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { hits: null, loading: true, cost: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Söker utanför samlingen…",
    );
  },
};

export const Empty: Story = {
  args: { hits: [], loading: false, cost: { usd: 0.011, rate: 9.62 } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Inget utanför samlingen hittades."),
    ).toBeInTheDocument();
  },
};

/** The checkbox was never on — the section renders nothing at all. */
export const NotRequested: Story = {
  args: { hits: null, loading: false, cost: null },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("heading")).not.toBeInTheDocument();
  },
};
