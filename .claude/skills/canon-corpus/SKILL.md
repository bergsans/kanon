---
name: canon-corpus
description: Add, remove, or troubleshoot authors and works in Canon's collection — Gutenberg, Litteraturbanken, Project Runeberg, or Marxists Internet Archive. Use when someone wants to expand the collection, when a work is missing from search, when build-corpus warns about a name with no matches, or when a work aborts during indexing. Also use for English requests about adding authors/works to the corpus or debugging the corpus manifest.
---

# The collection

The manifests (`src/lib/corpus*.json`) are **generated**. Never edit them by
hand — change the generator and rerun it. Always run `--dry` first: it prints
the full report without touching the file.

## Which script

| source                    | script                                           | name form                                                        | command                 |
| ------------------------- | ------------------------------------------------ | --------------------------------------------------------------- | ----------------------- |
| Project Gutenberg         | `scripts/build-corpus.ts`                        | the catalog's exact form **with birth year**: `"Darwin, Charles, 1809"` | `pnpm build-corpus`     |
| Litteraturbanken          | `scripts/build-corpus-sv.ts`                     | LB's `name_for_index`, without a year: `"Lagerlöf, Selma"`          | `pnpm build-corpus-sv`  |
| Project Runeberg          | `scripts/build-corpus-sv.ts`, the `RUNEBERG` list  | the title key from the address: `runeberg.org/rodarum/` → `rodarum`   | `pnpm build-corpus-sv`  |
| Marxists Internet Archive | `scripts/build-corpus-mia.ts`, the `ARCHIVES` list | index page path + name + **death year**                          | `pnpm build-corpus-mia` |

After every generation: `pnpm ingest --source=<source>` to actually index the
new material. A full ingest takes hours — use `--only=<work's source id>` for a single work.

## Gutenberg

The name goes into **one** genre list at the top of `build-corpus.ts` — `FILOSOFI`,
`POLITIK`, `VETENSKAP`, `HISTORIA`, `ANTROPOLOGI`, `DRAMA`, `DIKT`, `PROSA`, `RELIGION`, `ESSA`.
The list sets the genre on _all_ of the author's works, and the genre carries through to
reranking. Pick the author's primary form, not each work's: Seneca's tragedies
end up under philosophy, and that's the price of one label per author.

Pitfalls, in the order they usually hit:

- **A surname alone matches the wrong people, silently.** `"Wollstonecraft"` matches Mary
  Shelley, `"Darwin"` a golf writer, `"Emerson"` a children's book author. Use the
  catalog's exact form including the year. The generator warns on zero matches and
  distinguishes "the name doesn't exist" from "all works filtered out" — read which.
- **`JUNK_TITLE`/`JUNK_SUBTITLE`** look for biographies _about_ an author and
  catch major works that happen to be titled that way: _Jane Eyre: An Autobiography_ on `autobiograph`,
  _The Life of Reason_ and _The Life of Jesus_ on `life of`. Exceptions go in `ALLOW_IDS`,
  not by loosening the filter — 477 works get caught by it and most of them should be caught.
- **The selection is ranked by ascending Gutenberg ID**, which is not significance. For
  treatise writers it doesn't matter. For poets it's devastating: Shakespeare
  sits in folio order, so the cap gave _Henry VI_ parts 1–3 but neither _Hamlet_ nor
  _Lear_. Fix it with hand-picked IDs in `PRIORITY_IDS`.
- **Works without a named author** — the Bible, Beowulf, the Kalevala — can't be picked
  by name. Specify them by ID in `EXTRA`, with the author field set to the work's
  traditional name: that's the only grouping that means anything in the UI.
- **Multi-volume works are kept as volumes** (Gibbon, Buckle). The dedup key carries the
  volume number, otherwise exactly one volume survives, chosen arbitrarily.
  `MAX_VOLUMES_PER_WORK` = 6.

## Litteraturbanken

If the generator warns that a name yielded no works, it usually means **not**
that the author is missing, but that the editions are under a license that forbids
download — that's how Strindberg and Almqvist look. The generator only picks up `cc-0`.
Check litteraturbanken.se before correcting the name form.

## Runeberg

Check the key before adding it:

```bash
pnpm tsx scripts/.probe-runeberg.ts rodarum frkjulie hemsobor
```

Half the archive is unproofread OCR of 19th-century print. The text _looks_ like Swedish without
actually being it, and such works should be aborted, not indexed. The probe says which.

## Marxists Internet Archive

The most sensitive source: free texts, MIA's own CC translations, and texts they
host without rights sit in the same catalog, and the difference doesn't show in the address.
Only articles with a documented provenance line are included:

```
Source: L'Ordine Nuovo, 11 October 1919;
Translated: for the Marxists Internet Archive by Michael Carley.
```

The generator refuses archives whose author is still protected (`PROTECTION_YEARS`
= 70) and skips an author whose archive yields fewer than `MIN_PARTS` = 12
approved articles — "Writings and speeches" shouldn't be six newspaper articles. The report
prints every rejected article with its provenance line; review it, don't trust it blindly.

## The rights check runs twice

The manifest is a file that can be edited, so the check is redone at **every**
indexing run, in `gutenberg.ts` / `litteraturbanken.ts` / `runeberg.ts` / `marxists.ts`.
It's the second check that actually stops a protected text from reaching the index
(see AGENTS.md → "Not allowed" — it must never be loosened).

`titleMatch`/`authorMatch` are checked against the source's own file header during indexing.
If the ID points to the wrong edition, the work is aborted instead of silently poisoning the index.

## Copyright term

Life + 70 years, and the translation has its own 70 from the translator's death. Adorno becomes
free in 2040, Foucault in 2055, Lévi-Strauss in 2080. The permalink also makes the app a
publisher: a saved search publishes a thousand characters of quote at an
address. Never propose a source that "has the text anyway."
