import type { Decorator, Preview } from "@storybook/nextjs";
import { mswLoader } from "msw-storybook-addon/csf3";
import "../src/app/globals.css";
import { CostEstimateProvider } from "../src/app/components/providers/CostEstimateProvider";
import { LocaleProvider } from "../src/app/components/providers/LocaleProvider";
import { TextSizeProvider } from "../src/app/components/providers/TextSizeProvider";
import { DEFAULT_LOCALE, LOCALE_NAME, LOCALES } from "../src/lib/i18n";

/**
 * The app has no custom breakpoints in globals.css — components branch only
 * on Tailwind's stock sm (640px) and lg (1024px) prefixes (the only two
 * found across src/app/components). A generic device list (iPhone X, Pixel…)
 * would test sizes the layout never actually switches at, so the options
 * here are the two real breakpoints plus one step below and above each.
 */
const VIEWPORTS = {
  mobile: {
    name: "Mobile (< sm)",
    styles: { width: "375px", height: "812px" },
    type: "mobile",
  },
  sm: {
    name: "sm (640px)",
    styles: { width: "640px", height: "900px" },
    type: "mobile",
  },
  lg: {
    name: "lg (1024px)",
    styles: { width: "1024px", height: "900px" },
    type: "tablet",
  },
  desktop: {
    name: "Desktop (1440px)",
    styles: { width: "1440px", height: "900px" },
    type: "desktop",
  },
} as const;

/**
 * The three cross-cutting providers every component in the app sits inside
 * (see src/app/layout.tsx). A story never wraps these itself — that would
 * repeat the same three lines in twenty story files and risk one of them
 * drifting from the real provider order.
 */
const withProviders: Decorator = (Story, context) => {
  const locale =
    (context.globals.locale as (typeof LOCALES)[number]) ?? DEFAULT_LOCALE;
  return (
    <LocaleProvider locale={locale}>
      <TextSizeProvider>
        {/*
          A fixed, plausible estimate rather than 0/null: null renders as "no
          figure yet" in CostTag's caller, which would make every story that
          touches translation look like a brand-new install with zero
          history instead of demonstrating the real display.
        */}
        <CostEstimateProvider
          avgTranslationUsd={0.014}
          avgSearchUsd={0.12}
          provider="claude"
          rate={9.6}
        >
          <Story />
        </CostEstimateProvider>
      </TextSizeProvider>
    </LocaleProvider>
  );
};

const preview: Preview = {
  // Every component's `meta` already carries a doc comment on why it exists;
  // autodocs turns that and its props into a page without writing one.
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    // The guide reads in order — principles before the detail pages, known
    // issues last — and alphabetical order would scatter it.
    options: {
      storySort: {
        order: [
          "Design guide",
          [
            "Principles",
            "Architecture",
            "Foundations",
            ["Color", "Typography", "Layout"],
            "Patterns",
            "Voice and tone",
            "Accessibility",
            "Known issues",
          ],
          "Pure Components",
          "Smart Compositions",
        ],
      },
    },
    // Pergament, not Storybook's default checkerboard/white — the app has
    // no dark mode (`color-scheme: light` in globals.css, set with intent),
    // so a "dark" background choice here would misrepresent every component.
    backgrounds: {
      options: {
        parchment: { name: "Parchment", value: "#f6f4f0" },
      },
    },
    initialGlobals: {
      backgrounds: { value: "parchment" },
    },
    a11y: {
      test: "todo",
    },
    viewport: {
      options: VIEWPORTS,
    },
  },
  globalTypes: {
    locale: {
      name: "Locale",
      description:
        "Interface locale — controls every useT()/useLocale() call the same way LocaleProvider does in the app.",
      defaultValue: DEFAULT_LOCALE,
      toolbar: {
        icon: "globe",
        items: LOCALES.map((locale) => ({
          value: locale,
          title: LOCALE_NAME[locale],
        })),
      },
    },
  },
  decorators: [withProviders],
  loaders: [mswLoader()],
};

export default preview;
