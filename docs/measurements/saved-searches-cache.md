# Saved searches: permalink and cache

[← back to README](../../README.md)

### Saved searches

Every search is saved: the question, the passages' IDs, and Claude's
rationales. That gives three things for the same price.

**Permalink.** The answer gets an address, `/s/<slug>`, that can be reloaded
and passed along. The address bar is rewritten once the answer is ready, and
the home page lists the most recently asked questions.

**Cache.** The same question again costs nothing and answers instantly. Two
routes: an exact match on the normalized question, then vector similarity
against previous questions.

The key is the question **and** the scope. The same words asked of poetry
aren't the same search as the same words asked of the whole canon, and they
must not share an answer. That applies to the semantic cache too, and there it
cost something: the vector only knows the words, not the selection, and most
saved searches are unscoped — so the nearest neighbor to a scoped question is
almost always its unscoped twin. So five neighbors are fetched instead of one,
and the first with the same scope _and_ sufficient similarity wins. The
threshold is unchanged.

The semantic cache's threshold is measured, and it sits where it sits because
the classes overlap:

```
rephrasings of the same question    0.87 – 0.97
related but distinct questions      0.79 – 0.93
```

"Does a prince need power more than morals?" and its mirror, "Does a citizen
need morals more than power?", sit at 0.93 and must never share an answer. The
threshold of 0.95 leaves margin above that value and still catches the obvious
cases — "what is the good life?" against "what is a good life?" sits at 0.97.
Better a missed cache hit than an answer to the wrong question.

Only the passages' IDs are saved, never their text: the text lives in `chunks`
and is read from there every time. A saved search whose passages have vanished
in a reindex is treated as a miss instead of showing a half answer.

