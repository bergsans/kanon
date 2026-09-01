# Local reranking and the diversity filter

[← back to README](../../README.md)

3. **Local reranking** — a cross-encoder reads the question and the passage
   _together_ and gives a score for how well they answer each other. The
   fusion in step 2 only knows that a passage ranked high in some branch; it
   has never compared the passage to the question. The model is too costly for
   the whole collection and about right for 96 candidates — around 70 ms per
   passage, the whole retrieval clocked at twelve seconds.

   96, not 48. This step reads the fusion list from the top down to its limit,
   and everything below the limit is gone before the model even starts —
   there's no breakpoint where the search settles early, just a fixed cutoff.
   That the cutoff sat too high is measured: of the 28 candidates that went on
   to Claude in the run above, 13 came from fusion rank 49–96, and the three
   passages the cross-encoder ranked highest of all sat at rank 63, 67 and 68.
   At 48, the answer's best passage would never have been read. That also says
   something about the step itself: the fusion order and the cross-encoder's
   order have almost nothing to do with each other, which is exactly why the
   step exists.

   The model choice is measured. The only thing that matters is whether the
   model holds the languages together, since the question is Swedish and nine
   of ten passages are English. Measured as the overlap between the same
   question asked in Swedish and in English, over forty real candidates:

   | model                                          | top-10 overlap | Spearman | ms/pair |
   | ------------------------------------------------- | ---------------- | -------- | ------- |
   | `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1`        | 8/10              | 0.80     | 70      |
   | `Xenova/bge-reranker-base` (q8)                      | 4/10              | 0.30     | 130     |

   The larger bge model looks better on paper, but the quantized edition
   collapses: every score lands under 0.002 and the ranking is noise.

   Only _after_ this step comes the diversity filter: 3 passages from the same
   work and 4 from the same author per 28 candidates, meaning 7 and 9 at
   today's 64. Order matters — without a cap, "civilization versus barbarism"
   turns into fifteen passages out of Gibbon's six volumes, but a cap applied
   to the fusion order throws away a work's best passage because two weaker
   ones came before it. Bumped passages aren't discarded: they backfill from
   the end if the list would otherwise be too short.

   Rewriting the caps from fixed counts to shares isn't cosmetic. A fixed cap
   quietly tightens every time the candidate list grows — 3 of 28 is one in
   nine, 3 of 64 is one in twenty-one — and a widening that at the same time
   halves how many votes a work can contribute is two changes under one name.

