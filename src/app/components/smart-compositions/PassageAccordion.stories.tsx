import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect, fn } from "storybook/test";
import { PassageAccordion } from "./PassageAccordion";
import {
  contextApiHandler,
  PASSAGES,
  similarApiHandler,
  translateApiHandler,
  workApiHandler,
} from "./storyFixtures";

/**
 * The results list's one row — the biggest fan-out in the whole component
 * tree (ContextSheet, CopyButton, CostTag, MoreFromWork, SaveToProject,
 * SimilarPassages all render from inside it). "Mer …" behind `showMore`
 * only reveals SaveToProject/SimilarPassages/MoreFromWork once clicked, so
 * `Open` alone needs no network; `ShowingMore` and `Open`'s translate flow
 * are what actually exercise the mocked endpoints wired up in `parameters.msw`.
 */
const meta = {
  title: "Smart compositions/PassageAccordion",
  component: PassageAccordion,
  parameters: {
    layout: "padded",
    msw: {
      handlers: [contextApiHandler(), similarApiHandler(), workApiHandler(), translateApiHandler()],
    },
  },
  args: {
    passage: PASSAGES[0],
    position: 1,
    onToggle: fn(),
    search: { slug: "stoicism-epicureanism", prompt: "What distinguishes Stoicism from Epicureanism?" },
  },
} satisfies Meta<typeof PassageAccordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  args: { open: false },
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole("button", { name: /Epictetus, Encheiridion/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // The panel is unmounted while closed — see the component's own
    // comment on why (up to sixteen ~1200-character passages in the DOM
    // at once is what this avoids).
    await expect(canvas.queryByText(/In our power are opinion/)).not.toBeInTheDocument();

    await userEvent.click(toggle);
    await expect(args.onToggle).toHaveBeenCalledTimes(1);
  },
};

export const Open: Story = {
  args: { open: true },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText(/In our power are opinion/)).toBeInTheDocument();
    // Shown only before the click that spends the money — see
    // `avgTranslationUsd`'s own comment.
    await expect(canvas.getByText(/≈/)).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Översätt till svenska" }));
    await expect(
      await canvas.findByRole("button", { name: "Visa originalet" }),
    ).toBeInTheDocument();
    // The mocked /api/translate's Swedish rendering — see
    // storyFixtures.translateApiHandler.
    await expect(canvas.getByText(/Av tingen är somliga i vår makt/)).toBeInTheDocument();
    await expect(
      canvas.getByText(/Maskinöversatt av Claude/),
    ).toBeInTheDocument();
  },
};

export const SameWorkAsAbove: Story = {
  args: { open: false, position: 2, sameWorkAsAbove: true },
  play: async ({ canvas }) => {
    // The visible ditto mark stands in for the repeated "Author, Title" —
    // the full name stays for a screen reader (`sr-only`) even though the
    // visible label doesn't repeat it.
    await expect(canvas.getByText("———")).toBeInTheDocument();
    await expect(canvas.getByText("Epictetus, Encheiridion")).toBeInTheDocument();
  },
};

export const ShowingMore: Story = {
  args: { open: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mer …" }));
    await expect(canvas.getByRole("button", { name: "Spara i projekt" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Fler som denna/ })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Fler ur detta verk/ })).toBeInTheDocument();
  },
};

export const InProject: Story = {
  args: { open: true, position: undefined, search: undefined },
  play: async ({ canvas, userEvent }) => {
    // No rank digit without a results list behind the row — see `position`'s
    // own comment.
    await expect(canvas.queryByText("01")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Mer …" }));
    await expect(canvas.getByRole("button", { name: "Spara i projekt" })).toBeInTheDocument();
    // No search to read the work's other passages or origin query from —
    // "more from this work" isn't drawn at all, not drawn disabled.
    await expect(
      canvas.queryByRole("button", { name: /Fler ur detta verk/ }),
    ).not.toBeInTheDocument();
  },
};
