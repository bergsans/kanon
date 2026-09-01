import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { TextSizeSwitch } from "./TextSizeSwitch";

/**
 * The reading view's font-size dial. Reads and writes `TextSizeProvider`
 * (wrapped around every story in .storybook/preview.tsx) and persists to
 * `localStorage` exactly as it does in the app — click a step here and it
 * survives a Storybook reload the same way it survives a page reload.
 */
const meta = {
  title: "Pure Components/TextSizeSwitch",
  component: TextSizeSwitch,
  parameters: { layout: "centered" },
} satisfies Meta<typeof TextSizeSwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const large = await canvas.findByRole("button", { name: "Stor text" });
    await userEvent.click(large);
    // The one real side effect this control has: it scales the whole
    // document's root font size, not just its own three glyphs — see
    // `ROOT_SCALE` in TextSizeProvider.
    await expect(document.documentElement.style.fontSize).toBe("120%");

    // Restored so the next story to mount doesn't inherit this one's
    // choice through the shared `localStorage` key.
    const normal = await canvas.findByRole("button", {
      name: "Normal textstorlek",
    });
    await userEvent.click(normal);
    await expect(document.documentElement.style.fontSize).toBe("100%");
  },
};
