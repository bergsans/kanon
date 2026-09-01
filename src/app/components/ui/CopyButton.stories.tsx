import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, fn } from "storybook/test";
import { CopyButton } from "./CopyButton";

/**
 * The one "copy to clipboard, then confirm" shape shared by the permalink,
 * the quote, and the export menu — `useCopy` underneath is exercised the
 * same way in `ExportMenu`'s own stories.
 */
const meta = {
  title: "Pure Components/CopyButton",
  component: CopyButton,
  parameters: { layout: "centered" },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    text: fn(() => "https://canon.example/s/abc123"),
    label: "Copy link",
    done: "Copied",
  },
  play: async ({ args, canvas, userEvent }) => {
    const button = await canvas.findByRole("button", { name: "Copy link" });
    // `text` is built lazily on click, not on every render — see the
    // component's own comment on why it's a function and not a string.
    await expect(args.text).not.toHaveBeenCalled();
    await userEvent.click(button);
    await expect(args.text).toHaveBeenCalledTimes(1);
  },
};
