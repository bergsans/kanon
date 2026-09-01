import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, fn } from "storybook/test";
import { MoreFromWork } from "./MoreFromWork";
import { workApiHandler } from "./storyFixtures";

/**
 * More passages from a work already in the answer — the diversity filter's
 * leftovers. Renders only a text button until clicked (the fetch is
 * click-triggered, see the component's own comment), so `Default` shows
 * that closed state with no network involved; `Opened` uses the interaction
 * test runner to click through and exercise the mocked /api/work.
 */
const meta = {
  title: "Smart compositions/MoreFromWork",
  component: MoreFromWork,
  parameters: {
    layout: "padded",
    msw: { handlers: [workApiHandler()] },
  },
  args: {
    slug: "stoicism-epicureanism",
    workId: "epictetus-enchiridion-gutenberg",
    onOpenContext: fn(),
  },
} satisfies Meta<typeof MoreFromWork>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /Fler ur detta verk/ }),
    ).toBeInTheDocument();
    // Not fetched until clicked — no rows yet.
    await expect(canvas.queryByRole("listitem")).not.toBeInTheDocument();
  },
};

export const Opened: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button"));
    const rows = await canvas.findAllByRole("listitem");
    await expect(rows).toHaveLength(2);

    await userEvent.click(rows[0].querySelector("button")!);
    // The fixture's first passage carries chunkId 90000 — see
    // storyFixtures.WORK_PASSAGES.
    await expect(args.onOpenContext).toHaveBeenCalledWith(90_000);
  },
};
