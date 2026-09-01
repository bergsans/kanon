import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, fn } from "storybook/test";
import { SimilarPassages } from "./SimilarPassages";
import { similarApiHandler } from "./storyFixtures";

/**
 * The neighbors of a passage — the same thing said by someone else, a KNN
 * against the existing index rather than a paid search. Click-to-load, like
 * MoreFromWork: `Default` is the closed button, `Opened` clicks through
 * against the mocked /api/similar.
 */
const meta = {
  title: "Smart compositions/SimilarPassages",
  component: SimilarPassages,
  parameters: {
    layout: "padded",
    msw: { handlers: [similarApiHandler()] },
  },
  args: { chunkId: 10234, onOpenContext: fn() },
} satisfies Meta<typeof SimilarPassages>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /Fler som denna/ }),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("listitem")).not.toBeInTheDocument();
  },
};

export const Opened: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button"));
    const rows = await canvas.findAllByRole("listitem");
    await expect(rows).toHaveLength(2);
    await expect(canvas.getByText("Marcus Aurelius")).toBeInTheDocument();
    await expect(canvas.getByText("Seneca")).toBeInTheDocument();

    await userEvent.click(rows[0].querySelector("button")!);
    // The fixture's first neighbor carries chunkId 80000 — see
    // storyFixtures.SIMILAR_PASSAGES.
    await expect(args.onOpenContext).toHaveBeenCalledWith(80_000);
  },
};
