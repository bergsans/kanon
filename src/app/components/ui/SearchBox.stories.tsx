import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, fn, within } from "storybook/test";
import type { CorpusFacets, CorpusFilter } from "@/lib/taxonomy";
import { SearchBox } from "./SearchBox";

const AVAILABLE: CorpusFacets = {
  genres: ["filosofi", "politik", "historia", "drama", "dikt"],
  eras: ["antiken", "renässans", "upplysning", "1800-tal"],
};

/**
 * The question field plus the genre/era filter chips underneath it —
 * `onSearch` and `onFilterChange` are callbacks, so every fetch and every
 * cache lookup stays in `CanonSearch`, the smart composition this renders
 * inside of. That split is what makes this story possible without a
 * database behind it.
 */
const meta = {
  title: "Pure Components/SearchBox",
  component: SearchBox,
  parameters: { layout: "padded" },
  args: {
    onSearch: fn(),
    busy: false,
    available: AVAILABLE,
    external: false,
    onExternalChange: fn(),
    // A finished string, not computed here — `CanonSearch` is the one
    // component allowed to read `useCostEstimate()`; this box only ever
    // renders what it's handed. See the prop's own comment on `SearchBox`.
    estimate: "Claude · ~2 min 4 s · ≈ $0,1183 · 1,14 kr",
  },
} satisfies Meta<typeof SearchBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { filter: { genres: [], eras: [] }, onFilterChange: fn() },
  play: async ({ args, canvas, userEvent }) => {
    const field = await canvas.findByRole("textbox", { name: "Din fråga" });
    await userEvent.type(
      field,
      "What distinguishes Stoicism from Epicureanism?",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Sök" }));
    await expect(args.onSearch).toHaveBeenCalledWith(
      "What distinguishes Stoicism from Epicureanism?",
    );

    // Below three characters the submit button stays disabled — see the
    // `MIN_QUESTION_LENGTH` guard — so a stray keystroke can't fire a paid
    // search.
    await userEvent.clear(field);
    await userEvent.type(field, "ab");
    await expect(canvas.getByRole("button", { name: "Sök" })).toBeDisabled();
  },
};

export const TooShort: Story = {
  args: { filter: { genres: [], eras: [] }, onFilterChange: fn() },
  play: async ({ args, canvas, userEvent }) => {
    const field = await canvas.findByRole("textbox", { name: "Din fråga" });
    const guardrailText = "Frågan är för kort (minst 3 tecken).";

    // An untouched, empty field isn't invalid — just unstarted — so the
    // guardrail stays quiet and doesn't accuse anyone of anything yet.
    await expect(canvas.queryByText(guardrailText)).not.toBeInTheDocument();
    await expect(field).not.toHaveAttribute("aria-describedby");

    await userEvent.type(field, "ab");
    const message = await canvas.findByText(guardrailText);
    await expect(canvas.getByRole("button", { name: "Sök" })).toBeDisabled();
    // The message is wired to the field, not just sitting nearby — a screen
    // reader announces it as the reason the field is invalid.
    await expect(field).toHaveAttribute("aria-describedby", message.id);
    await expect(field).toHaveAttribute("aria-invalid", "true");

    // Enter bypasses a disabled button entirely — the guard has to live in
    // `submit` itself, or a stray keystroke-and-Enter still runs the paid
    // search the button was supposed to be blocking.
    await userEvent.type(field, "{Enter}");
    await expect(args.onSearch).not.toHaveBeenCalled();

    // A third character clears the guardrail and frees the button.
    await userEvent.type(field, "c");
    await expect(canvas.queryByText(guardrailText)).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Sök" })).toBeEnabled();
    await expect(field).toHaveAttribute("aria-invalid", "false");

    // Whitespace alone is the same as empty, not "too short" — the guard
    // reads the trimmed value, same as `submit` does.
    await userEvent.clear(field);
    await userEvent.type(field, "  ");
    await expect(canvas.queryByText(guardrailText)).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Sök" })).toBeDisabled();
  },
};

export const Filtered: Story = {
  args: {
    filter: { genres: ["filosofi", "politik"], eras: ["antiken"] },
    onFilterChange: fn(),
  },
  render: (args) => {
    const [filter, setFilter] = useState<CorpusFilter>(args.filter);
    return <SearchBox {...args} filter={filter} onFilterChange={setFilter} />;
  },
  play: async ({ canvas, userEvent }) => {
    const subjects = await canvas.findByRole("group", { name: "Ämne" });
    await expect(
      within(subjects).getByRole("button", { name: "filosofi" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      within(subjects).getByRole("button", { name: "alla ämnen" }),
    ).toHaveAttribute("aria-pressed", "false");

    // Deselecting every chip by hand is the same search as "alla ämnen" —
    // the normalization in `toggle` collapses both to the empty list.
    await userEvent.click(
      within(subjects).getByRole("button", { name: "filosofi" }),
    );
    await userEvent.click(
      within(subjects).getByRole("button", { name: "politisk teori" }),
    );
    await expect(
      within(subjects).getByRole("button", { name: "alla ämnen" }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};

export const Busy: Story = {
  args: {
    busy: true,
    filter: { genres: [], eras: [] },
    onFilterChange: fn(),
    initialValue: "What distinguishes Stoicism from Epicureanism?",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox")).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Söker…" })).toBeDisabled();
    // Hidden while busy — `CanonSearch`'s own status row takes over with
    // the live wait, and this line would otherwise repeat next to it.
    await expect(canvas.queryByText(/≈/)).not.toBeInTheDocument();
  },
};

export const NoFacets: Story = {
  args: {
    available: { genres: [], eras: [] },
    filter: { genres: [], eras: [] },
    onFilterChange: fn(),
  },
  play: async ({ canvas }) => {
    // A corpus with one value per axis offers no real choice — the whole
    // filter box is withheld rather than drawn with nothing to click.
    await expect(canvas.queryByRole("group")).not.toBeInTheDocument();
  },
};

/** The "utanför samlingen" checkbox — off by default, and its own callback fires on click. */
export const ExternalChecked: Story = {
  args: { filter: { genres: [], eras: [] }, onFilterChange: fn() },
  play: async ({ args, canvas, userEvent }) => {
    const box = await canvas.findByRole("checkbox", {
      name: /Inkludera källor utanför samlingen/,
    });
    await expect(box).not.toBeChecked();
    await userEvent.click(box);
    await expect(args.onExternalChange).toHaveBeenCalledWith(true);
  },
};

/**
 * A local model's own estimate line — always "kostar ingenting", never a
 * dollar figure, regardless of `avgSearchUsd`. Exactly the branch that
 * moving `estimate` out of this component and into a plain prop makes
 * possible to pin down in a story at all — see `SearchBox`'s own comment
 * on why it may not compute this itself.
 */
export const LocalModelEstimate: Story = {
  args: {
    filter: { genres: [], eras: [] },
    onFilterChange: fn(),
    estimate: "Lokal (qwen3:14b) · ~6 min 59 s · kostar ingenting",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Lokal (qwen3:14b) · ~6 min 59 s · kostar ingenting"),
    ).toBeInTheDocument();
  },
};
