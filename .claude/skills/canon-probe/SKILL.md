---
name: canon-probe
description: Write and run a measurement in Canon — a scripts/.probe-*.ts that settles a model choice, a threshold, a source, or a cost with a number instead of a guess. Use when a value should change and the reason for it doesn't exist, when two alternatives need comparing, or when someone asks "which is best" about a model, threshold, dtype, or candidate count. Also use for English requests to benchmark or measure something in this repo.
---

# Measurements

The repo's way of settling a question is to measure it and write the number into the code. A
`.probe-*.ts` isn't a test but a one-off measurement that leaves behind a figure
someone else can rely on. The files start with a dot so they sort away from `ingest`,
`eval`, and `status` — keep that convention.

## The shape

```ts
/**
 * <What is being measured, in one sentence.>
 *
 *   pnpm tsx scripts/.probe-name.ts              <what the default run does>
 *   CANON_MODEL=claude-haiku-4-5 pnpm tsx …      <a variant>
 *   pnpm tsx scripts/.probe-name.ts --compare    <compares saved runs>
 *
 * <What is held constant between runs, and why exactly that. Without this line
 * the difference in results can't be attributed to either factor.>
 */
```

The header comment is mandatory and the most important part: it says what the measurement
controls for. `.probe-rerank-model.ts` computes the plans **once** and saves
them to disk, otherwise both the expansion and the selection would differ between runs.

Write one line per result with the `RESULT` prefix when the output should be
greppable, as `cml.mjs` does. Intermediate results go in the scratch directory, not the repo.

## Existing measurements — read the closest one before writing a new one

The directory has more measurements than this list covers, and it keeps growing. Run

    ls scripts/.probe-*.ts scripts/.bench*.ts

(or `ls scripts/.probe-<topic>*` for a topic) and read the closest match
— the filenames are descriptive. Seven starting points:

```
.probe-header-match.ts   AGENTS.md requires it before Gutenberg ingest of a new author
.probe-orphans.ts        AGENTS.md requires it after a changed manifest ID form
.probe-lang-branch.ts    AGENTS.md cites the number — the embedding's language split, 98–100/100
.probe-rerank-model.ts   the reranking step, model by model
.probe-rerank.ts         the cross-encoder against the fusion order
.probe-cache.ts          the semantic cache's threshold
.probe-runeberg.ts       whether a Runeberg key is readable text or unproofread OCR
```

## Rules

- **Calls to Claude cost money.** Work out what the measurement will cost —
  number of queries × number of models × ~$0.03 — and state the figure before running. Always ask.
- **Hold everything but one thing constant.** If the measurement saves intermediate results to disk, that's
  usually why; do likewise.
- **Report what argues against it.** `bge-reranker-base` "looks better on paper" stays
  in the README precisely because the measurement said otherwise. A measurement that only
  confirms what was hoped for isn't finished.
- **The number must land in the code.** The measurement is only done once the value is in its
  constant, with the measurement in the doc comment, and the README line updated. A
  probe script no constant references hasn't settled anything.
- Local measurements (embedding, cross-encoder, chunking, Runeberg OCR) are free and
  can be run without asking — they only touch CPU and `data/`.
