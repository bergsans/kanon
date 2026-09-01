# The collection as a page (/samling)

[← back to README](../../README.md)

### The collection as a page

`/samling` lists everything that's indexed: subject by subject, and within a
subject by author name, with the title linked to the edition at the source.
The way there runs from the statistics line on the home page — it says how big
the collection is, and the link beside it says what's in it. It's the only
entry point into the collection that costs nothing.

The page reads the `works` table, not the manifest. The manifest is the wish
list; the table is what actually made it through fetching, the rights check
and chunking. A work that stranded shouldn't appear in a listing of what can
be searched.

Names are sorted with `Intl.Collator` in the reader's language, not with SQL's
`order by` — SQLite compares byte by byte, which puts Émile Zola and Söderberg
after Xenophon. The sort runs on the whole name as written, not on the surname:
the collection has Homer, the Bible and the Kalevala with no surname at all,
and "Erasmus of Rotterdam" and "Gustaf af Geijerstam" break every rule you
could write for picking one out.

Measured at 1,674 works and 317 authors, the page weighed 1.8 MB of HTML, 148
kB over the wire, and rendered in 0.4–1.4 s in the production build — entirely
static, no client component. A text filter changes that: `CorpusBrowser`
(`src/app/components/smart-compositions/CorpusBrowser.tsx`) takes the same `list` the server
already built and filters it in the browser, so the list ships once more as
data in the page's RSC payload, not just as HTML. How much that adds in the
production build isn't measured — the dev server gives no comparable figures,
since Turbopack's dev build carries a different overhead than what ships in
production. If it weighs enough to notice, that's the measurement that decides
whether the filter should become a server-side query parameter instead of
client state.

The filter folds diacritics and tolerates the odd misspelling
(`src/lib/fuzzy.ts`, the same `foldName` principle `gutenberg.ts` uses against
Gutenberg's headers) — otherwise "soderberg" wouldn't find Söderberg and
"kirkegard" wouldn't find Kierkegaard. If the search term matches the author's
name, the whole body of work is shown; if it only matches a title, only that
title is shown. The order the filter leaves is the bibliography's own, never
resorted by match strength.

