# Measuring a change to the chain

[← back to README](../../README.md)

### Measuring a change to the chain

Query expansion writes nine new hypothetical passages every time it runs. That
makes retrieval flatly unmeasurable: running `pnpm eval` before and after a
change to the branches means the difference between runs is partly the change,
partly nine freshly written HyDE passages, and no one can say which moved what.

So the plans are saved. The `plans` table holds the expansion for a question,
keyed on the normalized question and the model, and `pnpm eval` reads it. The
first run pays ~$0.021 per question; every run after that costs **zero** and
gives **identical** output. `--fresh` discards the plans when the prompt in
`EXPAND_SYSTEM` has actually changed and the saved answers are therefore
answers to a different question. A plan missing query forms for the
collection's languages — meaning a row written before the language branches —
is also re-expanded on its own, with a warning in the log: such a row would
otherwise have measured the old branches and reported it as a measurement of
the new ones. `pnpm eval` only counts the usable plans in its intro. The app
doesn't touch this table — its cache lives in `searches` and is keyed on the
whole answer.

The answer key lives in [`scripts/gold.ts`](scripts/gold.ts): twelve questions
with the authors that _must_ be among the candidates, how many genres should be
represented, and, for the bilingual questions, how many Swedish original
passages should be included. The requirements are **normative, not measured**
— where a requirement has support from a real run it's noted on the case's
`probes` line, and where it's an assumption, that's noted too.

Names are matched on the exact string from `works.author`, never on a
substring. It's the same lesson `build-corpus` carries: "Mill" appears in three
indexed names, and only one of them is John Stuart Mill.

The outcome has three states, not two — `hit`, `MISS` and `not indexed`. An
author not in the database isn't a bug in retrieval but a notice that
`pnpm ingest` isn't finished, and recall only counts what could actually be
tested. Otherwise the figure would rise on its own as indexing caught up and
look as if a change to the chain had helped.

The interface shows **only the selection**, in Claude's order and with his
rationale.

It wasn't always so. The list used to carry the whole candidate field — the
chosen ones first, then a divider, then the candidates minus the selection,
with no rationale and a line from the passage itself instead. The reasoning
was that not being selected isn't a judgment on the passage. That's still
true, but the result was a list where half the rows couldn't say why they were
there, and a row with no reason isn't an answer, it's a search result.

