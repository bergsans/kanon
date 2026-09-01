---
name: canon-storybook
description: Write or change a .stories.tsx in Canon, or change the .storybook/ configuration (main.ts, preview.tsx, mocks/actions.ts). Use when a component in src/app/components/ is missing a story, when a new component is added, or when the Storybook build or a mocked server action/fetch isn't working as expected. Also use for English requests about this app's Storybook setup, stories, or msw/action mocking.
---

# Storybook

Every component in `src/app/components/{ui,smart-compositions}/` has a `.stories.tsx` in
the same folder. `providers/` doesn't have one of its own — the three context
providers are wrapped globally in `.storybook/preview.tsx` instead, see the
`canon-ui` skill for why they're their own category.

`pnpm storybook` starts the dev server on port 6006. `pnpm build-storybook`
builds a static export to `storybook-static/` (gitignored) — run it
after a larger change in `.storybook/` to confirm the configuration
still compiles; `pnpm typecheck` doesn't catch errors in the webpack plugin.

## Why a story proves the right thing

A story isn't a screenshot, it's a claim: "this component
renders with these props, with no more context than what providers/preview.tsx
already gives it." A story that only renders after someone adds
ten lines of mock inside the story file itself is a sign that the component
belongs in `smart-compositions/` and not in `ui/` — see `canon-ui`'s boundary between
the folders. Never write a `.stories.tsx` before you know which of the two
folders the component actually belongs in.

## Providers, once, globally

`.storybook/preview.tsx` wraps **every** story in `LocaleProvider` +
`TextSizeProvider` + `CostEstimateProvider`, in the order `layout.tsx`
itself uses. A story should never wrap itself in a provider — that's
exactly the repeated three-lines-per-file pattern preview.tsx exists to
avoid, and a local deviation (wrong order, a prop that differs from
the global one) would only show up in that one file.

Storybook's toolbar has a "Locale" switch (sv/en) wired to the same
`LocaleProvider` the app uses — it controls `useT()`/`useLocale()` in all
stories at once, it's not a local detail of a single file.

## Server actions: one alias, not twenty mocks

`src/app/actions.ts` opens with `"use server"` and assumes the Next.js
server runtime (cookies, `redirect`, the database) — none of that exists in
Storybook's webpack build. `.storybook/main.ts` solves it with an **absolute
path alias** in `webpackFinal`: every import of `actions.ts`, whether
the caller writes `../../actions` or `@/app/actions`, is redirected to
`.storybook/mocks/actions.ts`.

That's a single point to update, not one per story. Adding a new
server action in `actions.ts`: add the corresponding no-op in
`mocks/actions.ts` with the same signature and return type — otherwise it's just the
new function that's missing when a `smart-compositions/` component imports it,
and the failure shows up as a broken webpack build, not as a clear type-error line.

The mock logs every call to Storybook's Actions panel
(`console.log("[storybook mock action] …")`) instead of silently
returning — otherwise a story can look like it works even when no button actually
does anything.

**Never touch this alias to work around a genuine bug in a
`smart-compositions/` component.** If a story crashes because a real server
action is called incorrectly (wrong argument order, wrong type), the bug is in the component,
not in the mock.

## Network: msw, one handler per endpoint

Four route handlers have their own fetch calls that a `smart-compositions/` component makes
directly (not via a server action): `/api/context`, `/api/similar`,
`/api/work`, `/api/translate`, plus the `/api/search` stream. Each has
a handler factory in `src/app/components/smart-compositions/storyFixtures.ts`
(`contextApiHandler`, `similarApiHandler`, `workApiHandler`,
`translateApiHandler`, `searchApiHandler`) that a story places in
`parameters.msw.handlers`:

```tsx
const meta = {
  // ...
  parameters: { msw: { handlers: [contextApiHandler()] } },
} satisfies Meta<typeof ContextSheet>;
```

`searchApiHandler` builds a real `ReadableStream` of NDJSON lines
(the same `SearchEvent` shape as `protocol.ts`), one line every 400 milliseconds —
not the whole response at once. This is deliberate: `CanonSearch`'s
`plan`/`retrieving`/`done` phases should actually be visible in a story, not skip
past each other in the same tick.

A component that fetches directly on `mount` (e.g. `ContextSheet`) needs its
handler in **every** story, otherwise the first render crashes — `msw`
logs an unhandled request in the browser console (`onUnhandledRequest: "warn"`
doesn't apply here, see the next paragraph) but the component's own error handling shows
a broken list. A component that fetches on click (`MoreFromWork`,
`SimilarPassages`) doesn't need a handler for its default story — only for a
`play` story that clicks through it, see `MoreFromWork.stories.tsx`.

Shared fixture data (`PASSAGES`, `AVAILABLE`, `COST`) lives in the same
`storyFixtures.ts`, built against the real types in `src/lib/protocol.ts` and
`src/lib/taxonomy.ts` — not freely invented objects. A fixture that
silently drifts from the real shape is worse than no fixture:
`pnpm typecheck` only catches it if the types are actually imported.

## Interaction and assertions: every story carries a `play`

**Every story in this repo has a `play` function with a real
`expect(...)` assertion**, not just an interaction. That's what AGENTS.md
means by "there is no test framework" — Vitest and Playwright are
deliberately not installed, so this is the entire test coverage: it runs when
someone actually opens Storybook or runs `pnpm build-storybook`, not via
a dedicated `pnpm test` command. Don't add `@storybook/addon-vitest`
or Playwright to run them headless without asking first — that's
exactly the trade-off AGENTS.md points to.

A component with a click-to-load pattern (`MoreFromWork`,
`SimilarPassages`, `CorpusBrowser`'s tab switching) clicks through to the
interesting state instead of duplicating the component's entire
state machine in a second story:

```tsx
export const Opened: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button"));
    await expect(await canvas.findAllByRole("listitem")).toHaveLength(2);
  },
};
```

`canvas`, `userEvent`, and `expect` come straight from the story context
(Storybook 10) — import `expect` (and `within`, `fn`, `waitFor` as
needed) from `storybook/test`, the rest comes from the play function's second
argument, not from a separate import.

### The pitfall: never guess a string, look it up in `i18n.ts`

Two real bugs occurred in this codebase because an assertion guessed a
string instead of looking it up:

- `"passage.more"` is **"Mer …"**, not "Fler …" — a `findByText(/fler/i)`
  never finds the button and times out with a confusing error message.
- `"recent.remove"` uses Swedish typographic quotation marks on **both**
  sides, `”…”` (U+201D), not straight quotes `"…"` — an assertion with
  straight quotes never matches the real `aria-label`.

Always look up the exact string in `src/lib/i18n.ts` before writing a
`getByText`/`getByRole` assertion against it, copy the characters (em dash,
quotation marks, the half-width middle dot `·`) verbatim instead of retyping
them by hand. A regex (`/substring/`) is safer than an exact string when you
only want to prove something is visible, not the exact wording.

## Tailwind and the theme

`.storybook/preview.tsx` imports `src/app/globals.css` directly — the same
`@theme` tokens, the same `postcss.config.mjs`. The background is set to
parchment's `--color-parchment-0` (`parameters.backgrounds`), not
Storybook's default white or dark: the app deliberately has no dark
mode (`color-scheme: light` in globals.css), and a "dark" option in the toolbar
would claim something the UI explicitly doesn't do.

## The design guide

The design guide is six pages under "Guide/" in the sidebar, not one file.
`.storybook/DesignPrinciples.mdx` ("Guide/Design principles") is the
foundational entry point — five one-line rules, each linking to the page
that covers it in detail — and itself links to the other five:
`GuideColorAndType.mdx`, `GuideSpacingAndSurfaces.mdx`,
`GuideComponentPatterns.mdx`, `GuideAccessibility.mdx`, and
`GuideKnownIssues.mdx`. Every page cites real strings and real class names
from the source, never an invented example.

The first four pages state rules only — what the app is meant to do — and stay
that way even where the code doesn't yet follow one; every case where it
doesn't lives in `GuideKnownIssues.mdx` instead, one table per topic, linked
back to the rule it breaks. That split exists so a rule page reads as a
short, stable reference and the drift list can grow or shrink without
touching it. Fixing an item is a separate, deliberate change: remove its row
in the same diff, don't leave a stale copy behind.

If you change a token color in `globals.css`, a contrast figure, a component
pattern, or a rationale one of these pages relies on: update **that page** in
the same diff, otherwise it soon shows something that no longer holds. A
change that shifts which page a fact belongs on (e.g. a known issue gets
fixed, or a new one is found) should move the fact, not leave a stale copy
behind.

`.storybook/main.ts`'s `stories` glob explicitly includes `.storybook/*.mdx`
— it is **not** recursive, so a new guide page must go directly in
`.storybook/`, not in a subfolder and not in `src/app/components/`, since
it's documentation about the components, not a component itself.

### Giving a guide page real, provider-wrapped examples

A bare `.mdx` file's own embedded JSX never receives `.storybook/
preview.tsx`'s `decorators` or `loaders` — those only wrap and load
*registered stories*, not markup written directly into a docs page. Two
mechanisms follow from that, in order of preference:

1. **`<Story of={...} />`**, imported from `@storybook/addon-docs/blocks`,
   referencing an existing export from the component's own `.stories.tsx`.
   This is the only correct choice for anything that fetches on mount or
   calls a server action (`ContextSheet`, `CanonSearch`, `NavMenu`,
   `ExportMenu`, `SaveToProject`) — it runs through the real Storybook
   pipeline, so `loaders` (the msw handlers a fetching component needs) and
   `decorators` (the three providers) both apply, the same as in the
   sidebar.
2. A `GuideProviders` wrapper, only for a fetch-free `ui/` component shown
   in a configuration no existing story already demonstrates. There is no
   fetch-free example needing it today, so `.storybook/guideProviders.tsx`
   was removed as unused code rather than kept on the chance one shows up —
   recreate it the same shape as `preview.tsx`'s own decorator (the same
   three providers, same order, same fixture values) the day a guide page
   actually needs it, rather than writing the three lines inline in that
   one page.

Neither mechanism applies to something that isn't exported at all (a
module-private helper like `SearchBox.tsx`'s own `chipClass`) or to a
side-by-side comparison spanning several different components' one-off
styles — for those, quote the real Tailwind class string verbatim into a
plain element, captioned with its file:line source, rather than reaching for
an invented example.

## What doesn't get a story

Pure helper functions and hooks without JSX (`format.ts`, `useModalFocus.ts`) don't get
a `.stories.tsx` — Storybook renders components, not functions.
`emphasis.tsx` is the borderline case: it returns `ReactNode` but isn't a
component itself (`emphasized()` is called from inside other components' JSX), and
therefore doesn't get its own story either — it's covered by `ContextSheet`'s and
`PassageAccordion`'s stories, both of which render text through it.
