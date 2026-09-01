---
name: canon-ui
description: Build or change Canon's user interface — the search box, the results list, the collapsible passages, the cost tag, the permalink, the context view, or the NDJSON stream between /api/search and the client. Use when working in src/app/. Also use for English requests about this app's React components, streaming UI, styling or Tailwind theme.
---

# The interface

Next.js 16, App Router, React 19, Tailwind 4. Read `node_modules/next/dist/docs/01-app/`
before writing code here — this version differs from the training data.

## The shape

Server components by default. `"use client"` only where there's state:
`CanonSearch`, `SearchBox`, `PassageAccordion`, `ContextSheet`, `CostTag`,
`RecentSearches`, `Permalink`, `LocaleSwitch`. The pages (`page.tsx`,
`s/[id]/page.tsx`) read the database on the server and pass down a ready-made
`InitialSearch`.

## Three folders, one boundary

`src/app/components/` splits into three, and the boundary between the first two is
the architecture's only real rule — see `.claude/skills/canon-storybook` for
how it's tested in Storybook:

- **`ui/`** — pure presentational components. Props in, JSX out. May use
  `useT`/`useLocale`/`useTextSize` (display language and text size are
  the UI's own concern, not the app's data) and their own local
  UI state (open/closed, hover). Must **not** fetch data, call a
  server action, or read `CostEstimateProvider`. `CloseIcon`,
  `SegmentedControl`, `CopyButton`, `SearchBox`, `TextSizeSwitch`,
  `emphasis.tsx`, `format.ts`, `useModalFocus.ts`.
- **`smart-compositions/`** — smart compositions. Own `fetch`, a server
  action, or assemble several `ui/` components with the app's data. Everything
  else: `CanonSearch`, `PassageAccordion`, `ContextSheet`, `CostTag`,
  `NavMenu`, `ProjectView`, etc. A `smart-compositions/` file may import
  from `ui/` and from siblings in `smart-compositions/`, never the reverse.
- **`providers/`** — the three context providers (`LocaleProvider`,
  `CostEstimateProvider`, `TextSizeProvider`), their own category. They sit in
  `layout.tsx` once, never in a single component's story — see
  `.storybook/preview.tsx`, which wraps every story in all three.

`SearchBox` lives in `ui/` despite reading `useT`: it takes `onSearch`,
`filter`, and `available` as props and owns no `fetch` — the search and
the cache belong in `CanonSearch`. `PageHeader` lives in
`smart-compositions/` despite lacking `"use client"`: it assembles
`LocaleSwitch` (a server action) and is therefore a composition, not a
leaf, even though it itself runs on the server.

`CorpusBrowser` reads its prop types (`Entry`, `Section`, `SectionKind`) from
`@/lib/corpus-view`, not from `app/samling/page.tsx` — a component in
`components/` never imports a route file.

The front page is two columns: the reading view at its own line length on the left, the archive of
previous queries in the right margin. The archive is an _entry point_ and should sit at the top, not
under the footer.

Every route touching the database or a model needs `export const runtime = "nodejs"`
— better-sqlite3 and onnxruntime are native, edge isn't an option.

## The stream

`/api/search` responds with NDJSON, one event per line, typed in `src/lib/protocol.ts`:
`plan` → `passages` → `done` | `error`. `readEvents` in the same file reads it and
handles the trailing partial line.

If you change the payload: the type in `protocol.ts` is the contract, and both ends should
change in the same diff. `PassagePayload.relevance` is never `null` — the payload
only carries Claude's selection.

The client aborts the previous stream with an `AbortController` before a new search
starts; the server goes quiet when `enqueue` throws. Keep both halves.

## What the list shows

**Only Claude's selection**, 10–16 passages, in his order and with his justification. All
passages start collapsed.

The list used to show the entire candidate field: the chosen ones first, then a divider, then the
remaining twenty-eight minus the selection — without justification, with a line from the passage
itself instead. The ordering was justified (a rejection isn't a judgment on the passage;
the diversity filter drops perfectly good passages) but produced a list where half the lines couldn't say
why they were there. Don't add it back. The way to the rejected passages is
"more like this," which starts from the passage instead of the query and costs nothing.

The `chronological` sort orders answers by time instead.

## Paths onward from an answer

`/api/context` and `/api/similar` cost **nothing** — the context is read from the raw file,
the neighbors are a KNN against embeddings already in the index. No new embedding,
no call to Claude, and therefore no `CostPayload` to send along. Don't add
a cost display there; that's the whole point of the two functions.

`similarChunks` tightens `diversify`'s cap to one author per row — the point is to
get away from the passage you're standing on, not to get four neighbors from the same book. Since
the results list only shows the selection, this is also the _only_ path to the candidates
the reranking left behind, and it starts from the passage instead of the query.

The context view should **stay still** as the window grows. It used to scroll
the quoted passage to the middle on every answer, which made "read on" unusable — you'd
get thrown back to where you came from. `ContextSheet` compensates instead: the scroll
shifts exactly as much as the document grew _above_, in a `useLayoutEffect`, and
the centering only remains for the very first window. Don't add back a
`scrollIntoView` on every `data`.

Shared display helpers (`shortLocator`, `quoted`) live in `components/ui/format.ts`
and not in `PassageAccordion`: the accordion renders the neighbor list, so importing from there
would be circular. The same reason keeps them in `ui/` rather than
`smart-compositions/` — pure functions without `useT` or `fetch`.

Citation export goes through `src/lib/citation.ts`, which is pure functions on
`PassagePayload` — it carries everything a citation needs. Every function takes `CiteOptions`
(`locale`, `fetchedAt`): the reference is written in the reader's language, but the work's and
author's names are facts from the collection and are never touched. **The year is deliberately
not in the reference**: `year` is the author's death year, and "Plato, The Republic (1892)" claims something
about the edition that no one has verified. BibTeX and RIS take works, not passages, so three
passages from the same book are deduped on `workId`.

## Style

Tokens from `@theme` in `globals.css`, never hex in components:

```
--color-parchment-50/100/200/300   warm paper, not white
--color-ink-400/600/800/900        ink
--color-accent-600/700             heading, marker, link
--font-serif                       the passages themselves
--font-sans                        the interface
```

Parchment and ink is the whole design: a reading view for 19th-century text, not a dashboard.
Serif for the quotes, sans for everything that's app. No dark mode — `color-scheme: light`
is set deliberately.

`prefers-reduced-motion` is honored in `globals.css`; new animations should go into the same
block.

## Language

The interface exists in **Swedish** (default) and **English**. No string the user
sees is written in a component — everything goes through the dictionary in `src/lib/i18n.ts`, which is typed
against the Swedish one: a key missing from the English one is caught by `pnpm typecheck`.

- Server components and route handlers: `getLocale()` from `src/lib/i18n-server.ts`
  (reads the `canon-locale` cookie), then `t(locale, "key")`.
- Client components: `useT()` from `LocaleProvider` — `t`, `tn` (plurals), `num`, `era`,
  `year`, `costLabel`, and `locale` for the libraries that take it.
- Numbers and dates are formatted with `bcp47(locale)`; amounts go through `money(locale)` in
  `src/lib/money.ts`, never a homemade `toFixed`. The same amount is written in twelve
  places in the cost modal, and twelve separate calls would have given twelve different figures.

The cookie, not the URL: a permalink points at the answer, not at the answer in a particular
language dress. Switching goes through the server function `setLocale` in `app/actions.ts`, which
`refresh`es — the client's state survives, so someone switching language mid-answer
keeps it.

**Claude's answers aren't localized.** The justifications come in Swedish regardless of the
UI language, and the translate button translates to Swedish. Changing that would require the semantic
cache to be keyed on language — a change in the pipeline, not in the UI.

The steps and line items on the bill ("query expansion," "input") are written by the server and
stored in Swedish in `cost_detail`. They're translated at _display_ time, through
`costLabel`, so that an old row can be read in both language versions without anyone
touching the database.

## Emphasis in the text

Gutenberg's and Runeberg's plain-text editions carry emphasis as `_like this_`. It's read
at display time — `src/app/components/emphasis.tsx`, `emphasized()` for full text and
`stripEmphasis()` for truncated previews — and never during indexing: the raw text
must stay the source's own, and the context view reads the same file.

## The cost tag

`CostTag.tsx` renders `CostPayload` from `protocol.ts`. `usd` and `originalUsd` are
kept separate for the cache hit's sake: an answer from the archive costs zero now but cost something
once, and both numbers say something. Never show only one. `perMillion` comes along
per row so that 8,000 tokens at $0.0016 doesn't otherwise look like a rounding error.
