import type { Meta, StoryObj } from "@storybook/nextjs";
import { expect } from "storybook/test";
import { LocaleSwitch } from "./LocaleSwitch";

/**
 * Swedish/English, as two words rather than a flag pair — see the
 * component's own comment on why. Calls the real `setLocale` server action,
 * which .storybook/mocks/actions.ts stands in for: watch the Actions panel
 * for the logged call instead of an actual cookie write.
 *
 * The toolbar's own "Locale" global (top of the Storybook UI) drives every
 * `useT()`/`useLocale()` call the same way `LocaleProvider` does in the app
 * — flip it to see this story's own active segment follow along.
 */
const meta = {
  title: "Smart compositions/LocaleSwitch",
  component: LocaleSwitch,
  parameters: { layout: "centered" },
} satisfies Meta<typeof LocaleSwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const swedish = await canvas.findByRole("button", { name: "Svenska" });
    await expect(swedish).toHaveAttribute("aria-pressed", "true");

    // Clicking calls the mocked `setLocale` — see .storybook/mocks/actions.ts
    // — but doesn't flip the segment itself: in the real app that happens
    // through the cookie plus `refresh()`, neither of which the mock does.
    // The segment staying put is the honest result of testing this
    // component in isolation from that round trip, not a bug in the story.
    await userEvent.click(canvas.getByRole("button", { name: "English" }));
    await expect(swedish).toHaveAttribute("aria-pressed", "true");
  },
};
