import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { CloseIcon } from "./CloseIcon";

/**
 * The one close mark every panel shares — NavMenu, ContextSheet, CostTag's
 * breakdown. A single drawn stroke instead of each panel picking its own
 * "×" glyph, so the affordance reads the same everywhere regardless of font.
 */
const meta = {
  title: "Pure Components/CloseIcon",
  component: CloseIcon,
  parameters: { layout: "centered" },
  argTypes: {
    size: { control: { type: "range", min: 12, max: 64, step: 2 } },
  },
} satisfies Meta<typeof CloseIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { size: 22 },
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector("svg");
    await expect(svg).toBeInTheDocument();
    await expect(svg).toHaveAttribute("width", "22");
    await expect(svg).toHaveAttribute("height", "22");
    // Decoration, not content — every panel that renders this relies on
    // its own button for the accessible "close" name.
    await expect(svg).toHaveAttribute("aria-hidden");
  },
};

export const Large: Story = {
  args: { size: 48 },
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector("svg");
    await expect(svg).toHaveAttribute("width", "48");
    await expect(svg).toHaveAttribute("height", "48");
  },
};
