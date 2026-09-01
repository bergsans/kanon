import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { ChipRow } from "./ChipRow";

/**
 * One axis of `SearchBox`'s genre/era filter. Controlled by design
 * (`selected`/`onChange`), so every story wraps it in local state — the
 * same way `SearchBox` owns the value for both axes it renders.
 */
const meta = {
  title: "Pure Components/ChipRow",
  component: ChipRow<string>,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ChipRow<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unfiltered: Story = {
  args: {
    label: "Ämne",
    allLabel: "alla ämnen",
    options: ["filosofi", "politik", "historia"],
    selected: [],
    onChange: () => {},
    busy: false,
    labelOf: (value) => value,
  },
  render: (args) => {
    const [selected, setSelected] = useState(args.selected);
    return <ChipRow {...args} selected={selected} onChange={setSelected} />;
  },
  play: async ({ canvas }) => {
    const group = await canvas.findByRole("group", { name: "Ämne" });
    await expect(
      canvas.getByRole("button", { name: "alla ämnen" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(group).toBeInTheDocument();
  },
};

export const Toggling: Story = {
  args: {
    label: "Ämne",
    allLabel: "alla ämnen",
    options: ["filosofi", "politik", "historia"],
    selected: [],
    onChange: () => {},
    busy: false,
    labelOf: (value) => value,
  },
  render: (args) => {
    const [selected, setSelected] = useState(args.selected);
    return <ChipRow {...args} selected={selected} onChange={setSelected} />;
  },
  play: async ({ canvas, userEvent }) => {
    const filosofi = await canvas.findByRole("button", { name: "filosofi" });
    await userEvent.click(filosofi);
    await expect(filosofi).toHaveAttribute("aria-pressed", "true");
    await expect(
      canvas.getByRole("button", { name: "alla ämnen" }),
    ).toHaveAttribute("aria-pressed", "false");

    // Selecting every option by hand normalizes to the same empty
    // selection as "alla ämnen" — see the comment on `toggle` in ChipRow.
    await userEvent.click(canvas.getByRole("button", { name: "politik" }));
    await userEvent.click(canvas.getByRole("button", { name: "historia" }));
    await expect(
      canvas.getByRole("button", { name: "alla ämnen" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(filosofi).toHaveAttribute("aria-pressed", "false");
  },
};

export const Busy: Story = {
  args: {
    label: "Epok",
    allLabel: "alla epoker",
    options: ["antiken", "1800-tal"],
    selected: ["antiken"],
    onChange: () => {},
    busy: true,
    labelOf: (value) => value,
  },
  play: async ({ canvas }) => {
    const buttons = await canvas.findAllByRole("button");
    for (const button of buttons) await expect(button).toBeDisabled();
  },
};
