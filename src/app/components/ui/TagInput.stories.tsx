import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { TagInput } from "./TagInput";

/**
 * The tag-entry field on a project's edit form. Controlled by design
 * (`value`/`onChange`), so every story wraps it in local state — the same
 * way `ChipRow`'s stories own the selection they render.
 */
const meta = {
  title: "Pure Components/TagInput",
  component: TagInput,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TagInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    value: [],
    onChange: () => {},
    suggestions: ["filosofi", "antiken", "essay"],
    placeholder: "Lägg till en tagg, Enter för att spara",
    removeLabel: (tag) => `Ta bort taggen ${tag}`,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <TagInput {...args} value={value} onChange={setValue} />;
  },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByPlaceholderText(
      "Lägg till en tagg, Enter för att spara",
    );
    await userEvent.type(input, "stoicism{enter}");
    await expect(canvas.getByText("stoicism")).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Ta bort taggen stoicism" }),
    );
    await expect(canvas.queryByText("stoicism")).not.toBeInTheDocument();
  },
};

export const Suggestions: Story = {
  args: {
    value: [],
    onChange: () => {},
    suggestions: ["filosofi", "antiken", "essay", "etik"],
    placeholder: "Lägg till en tagg, Enter för att spara",
    removeLabel: (tag) => `Ta bort taggen ${tag}`,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <TagInput {...args} value={value} onChange={setValue} />;
  },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByPlaceholderText(
      "Lägg till en tagg, Enter för att spara",
    );
    await userEvent.type(input, "et");
    const suggestion = await canvas.findByRole("button", { name: "etik" });
    await userEvent.click(suggestion);
    await expect(canvas.getByText("etik")).toBeInTheDocument();
    await expect(input).toHaveValue("");
  },
};

export const AtCap: Story = {
  args: {
    value: Array.from({ length: 10 }, (_, i) => `tagg${i + 1}`),
    onChange: () => {},
    suggestions: [],
    placeholder: "Lägg till en tagg, Enter för att spara",
    removeLabel: (tag) => `Ta bort taggen ${tag}`,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <TagInput {...args} value={value} onChange={setValue} />;
  },
  play: async ({ canvas }) => {
    // Placeholder only shows on an empty field; at the ten-tag cap the
    // field is disabled instead, so its accessible role is the only thing
    // left to query it by.
    const inputs = canvas.getAllByRole("textbox");
    await expect(inputs[0]).toBeDisabled();
  },
};
