# Reranking at Claude, and how many passages an answer consists of

[← back to README](../../README.md)

4. **Reranking at Claude** — Claude gets the 64 candidates, marked with genre
   and language, and gives a rationale for each one that actually answers the
   question. This is where "is about freedom" gets separated from "answers
   this question about freedom".

   **The prompt no longer asks for a count.** It used to ask for 10–16
   passages, and that cap stayed in place until someone asked why the answer
   never got any longer. The answer was that it was never the selection step
   that limited it — see the measurement under "How many passages an answer
   consists of" below. Now the prompt asks for every passage that answers, so a
   narrow question gives a short list and a broad one a long one; the only cap
   left is `CANDIDATES`.

If the search is scoped, it's stated in the **user message** to both Claude
steps, one line per axis: "The search is limited to the subjects: …". Expansion
then writes all nine passages in the registers and period languages that exist
within the selection, and reranking knows the genre-spread requirement applies
within that instead of across ten genres it can't reach. The line sits in the
user message and not the system prompt because the latter goes out as a cached
block: a system prompt that varied with the selection would have produced
thousands of prefixes, one per subset, and the five-minute cache would never
have hit anything.


### How many passages an answer consists of

Nothing determines it, and that's deliberate. The prompt asks for every
passage that answers the question, not for a count, so a narrow question gives
a short list and a broad one a long one. The only cap is `CANDIDATES`.

It used to ask for 10–16, and that line stayed in place until someone asked
why the answer never got any longer. Two answers were tried, and it's the
difference between them that's worth keeping.

**What didn't work: letting the cross-encoder cut on score.** It gives a
number per passage, so it's tempting to set a threshold and let the count fall
out of it. `.probe-cross-threshold.ts` measured three forms — absolute
(`s >= T`), relative (`s >= α · s_max`), and the largest jump in the sorted
list — over the gold standard's twelve questions. None of them even reached
today's recall:

| form                            | recall | count (min/median/max) |
| ---------------------------------- | ------ | -------------------------- |
| no threshold, 28 candidates          | 7/19   | 28 / 28 / 28                 |
| absolute, T=0.05                      | 6/19   | 6 / 25 / 41                   |
| absolute, T=0.20                      | 1/19   | 0 / 6 / 19                    |
| relative, α=0.05                      | 7/19   | 11 / 35 / 47                  |
| relative, α=0.20                      | 3/19   | 2 / 12 / 21                   |
| largest jump                          | 2/19   | 4 / 5 / 10                    |

The reason is already in `rerank.ts`: the model's numbers are _"only
comparable within the same call — it's a ranking, not a measure"_. The scores
collapse toward zero long before the passages the answer key requires.
Aristotle sits at 13% of the top score on the good-life question, Mill at 3%
on the freedom question, Gibbon at 2% on the barbarism question. A threshold
cutting anywhere near those figures cuts away the answer.

**What worked: a wider candidate list.** Same measurement, same questions,
only the cap changed and no threshold at all:

| candidates (cap per work/author) | recall    | broken diversity requirements |
| ------------------------------------ | --------- | -------------------------------- |
| 28 (3/4) — as before                    | 7/19      | 0                                  |
| 48 (5/7)                                 | 11/19     | 0                                  |
| **64 (7/9)** — now                       | **13/19** | 0                                  |
| 96 (10/14)                               | 15/19     | 0                                  |

So it was never the selection step that made the answer short. At 28, six of
nineteen must-have authors never reached Claude at all: Mill sat at rank 60 on
the freedom question, Gibbon at 34, Marx at 36. Those passages weren't in the
room where the choice was made, and no instruction to Claude could have
produced them.

96 buys two more requirements and was rejected anyway — candidate text is the
bill's largest line item and those two cost ~$0.04 more per search. Anyone who
wants them should change the `CANDIDATES` line.

The rejected ones aren't discarded. They've been through retrieval and the
cross-encoder, and the path to them is called **"more like this"** inside a
passage: a KNN against embeddings already in the index, free, and starting
from the passage actually being read rather than from the question.

Every passage sits in a collapsible block, and all start closed. The list can
be ordered by relevance or chronologically; the latter shows something else —
that Tacitus, Gibbon and Conrad say partly the same thing seventeen hundred
years apart.

Italics in the raw text — Gutenberg's and Runeberg's `_like this_` — are read
at display time, not at indexing time: the raw text should stay the source's
own, and `src/app/components/ui/emphasis.tsx` is the only place that knows
about it.

