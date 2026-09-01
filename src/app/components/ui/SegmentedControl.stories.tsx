import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { SegmentedControl } from "./SegmentedControl";

/**
 * The shared "pick one of N" control behind the text-size, language and
 * results-order switches. Controlled by design (`value`/`onChange`), so
 * every story here wraps it in local state — the same way each real caller
 * (TextSizeSwitch, LocaleSwitch, CanonSearch's sort toggle) owns the value.
 */
const meta = {
  title: "Pure Components/SegmentedControl",
  component: SegmentedControl<string>,
  parameters: { layout: "centered" },
} satisfies Meta<typeof SegmentedControl<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextSize: Story = {
  args: {
    ariaLabel: "Text size",
    value: "md",
    onChange: () => {},
    segments: [
      { value: "sm", label: "A", ariaLabel: "Small text" },
      { value: "md", label: "A", ariaLabel: "Normal text" },
      { value: "lg", label: "A", ariaLabel: "Large text" },
    ],
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <SegmentedControl {...args} value={value} onChange={setValue} />;
  },
  play: async ({ canvas, userEvent }) => {
    const initial = await canvas.findByRole("button", { name: "Normal text" });
    await expect(initial).toHaveAttribute("aria-pressed", "true");

    const large = await canvas.findByRole("button", { name: "Large text" });
    await expect(large).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(large);
    await expect(large).toHaveAttribute("aria-pressed", "true");
    await expect(initial).toHaveAttribute("aria-pressed", "false");
  },
};

export const Locale: Story = {
  args: {
    ariaLabel: "Locale",
    value: "sv",
    onChange: () => {},
    segments: [
      { value: "sv", label: "Svenska", lang: "sv" },
      { value: "en", label: "English", lang: "en" },
    ],
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <SegmentedControl {...args} value={value} onChange={setValue} />;
  },
  play: async ({ canvas, userEvent }) => {
    const english = await canvas.findByRole("button", { name: "English" });
    await userEvent.click(english);
    await expect(english).toHaveAttribute("aria-pressed", "true");
    await expect(english).toHaveAttribute("lang", "en");
  },
};

export const Disabled: Story = {
  args: {
    ariaLabel: "Sort order",
    value: "relevance",
    onChange: () => {},
    disabled: true,
    segments: [
      { value: "relevance", label: "Relevance" },
      { value: "chronological", label: "Chronological" },
    ],
  },
  play: async ({ canvas }) => {
    const buttons = await canvas.findAllByRole("button");
    for (const button of buttons) await expect(button).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Relevance" }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};
