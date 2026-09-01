---
description: Run the repo's automatic gate (pnpm typecheck) plus the free db check (pnpm status), report both.
allowed-tools: Bash(pnpm typecheck), Bash(pnpm status)
---

Run `pnpm typecheck` — this is the only automatic gate in this repo (AGENTS.md →
"Verifiering"); there is no test framework. Then run `pnpm status`, which reads the
database and is free.

Report:
1. **typecheck** — pass/fail; if failed, the file, line and error.
2. **status** — its output as-is (indexed work/author/chunk counts).
