# Text Creation Partnership

[← back to README](../../README.md)

**Text Creation Partnership** gives what otherwise exists only in later
editions: English print 1473–1700 as it was printed. _Leviathan_ 1651, Milton's
polemical tracts in their own typography, Harrington's _Oceana_, Filmer's
_Patriarcha_, Winstanley's Digger pamphlets, Browne's _Religio Medici_.
Harrington, Filmer, Winstanley, Sidney, Cudworth, Browne, Burton, Boyle, Donne,
Marvell and Traherne weren't in the collection at all — without them,
seventeenth-century political theory was just Hobbes and Locke, meaning the
conclusions without the dispute they came out of.

The texts are **hand-transcribed**, not OCR-read. That's the decisive
difference from Internet Archive and HathiTrust, whose seventeenth-century
material is machine-read and therefore unusable for the same reason Runeberg's
unread pages are.

_The overlap is often the point here_, unlike with Perseus. Gutenberg's
Leviathan is a nineteenth-century edition with normalized spelling; TCP's is
the 1651 text. They're two different texts, and a question about sovereignty
can be better answered by one than the other. The generator lists the overlap
anyway, because it should be a choice.

Three things had to be measured before the source could be used, and all three
were surprises:

**The catalog's `Status` lies.** `TCP.csv` marks 32,853 texts `Free` and 28,462
`Restricted`, which looks like a rights boundary. It isn't — the column is a
holdover from the release phases. Of twenty sampled texts, fourteen `Free` and
six `Restricted`, all twenty carry a CC0 dedication in their own
`<availability>`, and the `Restricted` ones say it more clearly of the two. The
check reads the file's own line and ignores the column. That the works
themselves are free follows from having been printed before 1700; there's no
translation with its own protection term here, unlike Perseus.

**Long s has to go.** Roughly half the texts use ſ instead of s, and the
distribution is bimodal: either zero or 105–172 occurrences per thousand words,
never in between. BM25 never matches "first" against "firſt", so leaving the
character in place makes half the source invisible to the keyword branch. The
normalization is purely typographic.

**The gaps are almost always a letter.** Where the print is damaged, TCP inserts
`<gap reason="illegible"/>`. Counted across all gaps, _Religio Medici_ came out
at 33 per thousand words and looked unusable. But of 42,351 gaps across 258
texts:

```
85.3%   one or a few letters   "common ardo…r of contention"
11.5%   one word
 1.4%   a line, a paragraph, a page
```

A missing letter is cosmetic — the reader sees "ardour" regardless, and only
the one word drops out of BM25. Counted by _lost words_, Religio Medici sits at
1.09 and is fully readable. The first measure was the wrong thing to measure.
The cutoff sits at four lost words per thousand, just above p95 in the
distribution (median 0.08, p90 1.65, max 14.9).

