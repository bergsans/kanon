---
description: Run pnpm typecheck plus pnpm build-storybook — the extra check canon-ui-architect runs when .storybook/** or a stories file changed.
allowed-tools: Bash(pnpm typecheck), Bash(pnpm build-storybook)
---

Run `pnpm typecheck`, then `pnpm build-storybook`. `build-storybook` is the only
check that catches a broken `main.ts` webpack config or a broken msw handler —
`pnpm typecheck` only sees types, not whether the build actually starts. Don't run
`pnpm storybook` (the dev server); it doesn't terminate on its own.

Report pass/fail for each step; if `build-storybook` fails, include the relevant
error excerpt, not the full log.
