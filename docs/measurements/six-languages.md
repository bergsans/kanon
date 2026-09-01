# Six languages, and why it works

[← back to README](../../README.md)

### Six languages, and why it works

**For a long time this said the chain only cares about language in exactly
three places: chunking's heading rules, which query form the cross-encoder
scores the passage against, and the translate button's guard against
translating Swedish into Swedish. That was wrong, and the fourth place is what
decided everything.** Both models are multilingual —
`multilingual-e5-small` and `mmarco-mMiniLMv2` — and from that the conclusion
was drawn that retrieval didn't need to know anything about language. That
conclusion didn't hold.

The symptom was that works in languages other than English never made it into
the results list, even though a good fifth of the collection's passages are
non-English. The natural suspect was the cross-encoder, which scored everything
except Swedish against the English query form. But a run of `hybridSearch` with
reranking turned off showed that the fusion list of ninety-six candidates was
already 96/96 English on two of three questions. The loss sat before
reranking, in retrieval itself.

`.probe-lang-branch.ts` measured why: **the embedding model splits the vector
space by language before content.** The same passage, the same idea, written
in four languages, and the language spread among the hundred nearest neighbors
to each:

| passage written in | 100 nearest neighbors | best distance | rank 100 |
| ------------------- | ----------------------- | -------------- | -------- |
| English              | en 99, fr 1              | en 0.465       | 0.500    |
| French               | fr 100                   | fr 0.398       | 0.487    |
| German               | de 98, fr 2              | de 0.443       | 0.478    |
| Swedish              | sv 100                   | sv 0.452       | 0.485    |

The split doesn't follow the collection's share: German is two percent of the
passages and still takes ninety-eight of a hundred slots when the query
passage is German. It's language identity that dominates the vector, not the
material's size. And because query expansion wrote its four HyDE passages
**in English**, the four vector branches became four English branches — the
non-English works had no way into the candidate list at all. No threshold, no
pool size and no prompt further down the chain could have fixed that.

The fix is **one branch per language**: expansion writes the four English
registers plus one passage in each of the collection's other five languages, in
that language's own register and century, and retrieval gets nine vector
branches instead of four. Measured before and after on the same questions and
the same cross-encoder (`.probe-lang-pipeline.ts`), the languages among the
candidates that went on to Claude — measured back when the pool was
twenty-eight, not today's sixty-four:

| question                                                    | four English branches | nine branches, one per language |
| -------------------------------------------------------------- | ---------------------- | ---------------------------------- |
| "What gives the state the right to rule over its citizens?"    | en 27, fr 1             | en 17, fr 5, la 3, de 2, sv 1       |
| "What happens to the soul after death?"                         | en 24, de 3, sv 1       | en 18, fr 5, de 3, sv 2             |

It isn't a cosmetic reshuffle. Tocqueville's _De la Démocratie en Amérique_
came in at cross-encoder score 0.314 on the state question, Montaigne's
_Essais_ at 0.579, and Descartes's _Discours de la méthode_ at 0.530 on the
soul question — all three invisible before, all three ranked higher than most
of what stood in their place.

The price is latency and tokens. Nine KNNs instead of four adds ~1.5–3.5 s to
a retrieval that runs around twelve seconds, and five extra passages, five
query forms and about twenty extra keywords of output lift the expansion step
from ~$0.014 to ~$0.021.

Two follow-on fixes belonged to the same bug. The BM25 branch had English
keywords and could therefore only hit French or German text via proper names;
the keywords are now six-language, and the FTS cap is raised from 24 to 96
terms, since otherwise the cut would have taken English and maybe French and
silently dropped the rest. And the mentions branch scored against the English
treatise passage, which made a mentioned Strindberg look like a Swedish work
seen through an English vector; it now takes the smallest distance to any of
the passages, in the same pass and so at the same cost.

#### Does the score hold together across languages?

With the language branches, the list the cross-encoder sorts becomes **mixed**,
and it sorts on absolute score. The repo's earlier language measurements don't
answer whether that works: they all measure rank agreement _within_ one
language. A systematic offset between languages wouldn't have shown up as a
bug — just as a results list that stayed English after the branches were
rebuilt precisely so it wouldn't.

`.probe-lang-crossscore.ts` measures it directly: the same content written in
all six languages, plus twelve passages that _don't_ answer, all scored against
the same Swedish question and sorted together.

| language | score, answers | score, doesn't answer | difference | mean rank of 18 |
| -------- | --------------- | ----------------------- | ----------- | ----------------- |
| English   | 0.598            | 0.023                    | 0.575        | 3.0                 |
| Italian   | 0.630            | 0.028                    | 0.602        | 3.0                 |
| German    | 0.587            | 0.046                    | 0.541        | 3.3                 |
| French    | 0.429            | 0.039                    | 0.390        | 2.7                 |
| Latin     | 0.368            | 0.036                    | 0.332        | 4.7                 |
| Swedish   | 0.377            | 0.006                    | 0.371        | 5.3                 |

Six answering passages among eighteen would, at perfect sorting, give mean rank
3.5. Four of the languages sit below that; Latin and Swedish just above. So no
language quota is needed — the model also tells answering from non-answering
apart in all six languages, which is the measure `.probe-rerank-more.ts` showed
was the real one.

#### The cross-encoder's language measurements

What was measured before the language branches existed still holds — it just
answers a different question: does the ranking hold up _within_ one language?
Measured with the repo's own method: the same candidates ranked against the
Swedish question and against the question in the passage's own language, four
questions, forty candidates.

An earlier run of this measurement (`.probe-rerank-lang.ts`) used Thucydides in
three translations and gave French a misleadingly weak score — comparable
material, but all three were translations from Greek, so there was no way to
tell the language apart from the translator's prose. `.probe-rerank-native.ts`
measured again on native prose instead — Kant and Hegel, Tocqueville and
Montesquieu, Locke and Hobbes:

| language | top-10 | Spearman | score spread |
| -------- | ------ | -------- | ------------- |
| English   | 5.8/10 | 0.715    | 0.139          |
| German    | 6.1/10 | 0.663    | 0.161          |
| French    | 5.3/10 | 0.594    | 0.158          |

German is indistinguishable from English. French is weaker but clearly usable.
What remains is that a French passage needs to sit somewhat higher in the
fusion than an English one to survive reranking.

#### Agreement isn't enough as a measure

Overlap and Spearman measure whether two rankings resemble each other — not
whether the model understands the language. A model that scores everything
almost the same is perfectly consistent in its indifference and gets a high
Spearman on pure length noise. That's exactly how the bge model failed in
`.probe-rerank.ts`: "every score lands under 0.002 and the ranking is noise."

That's why **the score spread** stands in the table above, and why the next
four languages were measured on the same work in two languages each — so the
content is held constant and the difference is the language:

| pair                        | language | top-10 | ρ     | spread    | English control |
| ---------------------------- | -------- | ------ | ----- | --------- | ----------------- |
| Dante, _Commedia_             | Italian   | 6.5/10 | 0.713 | **0.108** | 0.074              |
| Cervantes, _Quijote_          | Spanish   | 6.5/10 | 0.748 | **0.049** | 0.111              |
| Ibsen, _Et dukkehjem_         | Norwegian | 7.0/10 | 0.901 | **0.143** | 0.022              |
| Descartes, _Meditationes_     | Latin     | 7.0/10 | 0.841 | **0.099** | 0.133              |

Italian and Latin sit in English's range and were admitted. Spanish doesn't:
less than half of English's spread on the same work and the same questions,
despite the _highest_ rank agreement of all four — precisely the combination
that reveals indifference. Without the spread measure, Spanish would have
looked like the best of the four.

Norwegian looks the best but the pair is unreliable: the English control fell
to 0.022, lower than everything else in the table, meaning those particular
passages from _A Doll's House_ don't answer the questions. Then the difference
measures the sample, not the language. Norwegian sits closest to Swedish of all
the candidates and is probably the safest bet, but the measure doesn't show
that — it needs remeasuring with a better pair before it's built.

An honest cost: a German or French passage in the results list is less
readable for a Swedish reader than an English one. The translate button covers
that — the new languages are "not Swedish" and so get the button without a
single line having to change — but it's a real cost, not just a gain.

