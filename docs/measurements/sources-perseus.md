# Perseus Digital Library

[← back to README](../../README.md)

**Perseus Digital Library** is the only source that hands out the text _with its
own citation intact_. Gutenberg's Thucydides is a text file where chunking has
to guess where the books begin; Perseus's version of the same text is TEI with
book, chapter and paragraph spelled out in the markup. The difference shows in
the results list — "Book 1, Chapter 22" instead of nothing — and that's the
whole reason a fifth source was worth the trouble. All 103 works have a citation
on every passage.

The archives sit on GitHub as `PerseusDL/canonical-greekLit` and
`canonical-latinLit`, and every text has a CTS URN that translates straight into
a file path. `sourceId` is the URN, and it's also the address to Perseus's own
reader, Scaife.

_Only the English translations are indexed._ The archives hold 814 Greek and
428 Latin original texts, and none of them are brought in: chunking's heading
rules don't exist for Greek or Latin, and a polytonic Greek passage in the
results list doesn't answer a Swedish question. The 1,047 English translations
are what can actually answer one.

The selection is built around what Perseus _adds_. Thirty-four of antiquity's
authors were already in the collection via Gutenberg, and a line that adds one
of them adds a second edition of the same work — sometimes rightly so, but a
decision and not a side effect. The generator reports the overlap. What was
genuinely missing was two groups: the Attic orators, and scientific prose.
Rhetoric was the one major genre of antiquity that wasn't there at all, and it's
no curiosity — a question about citizenship or the justification of war is in
practice answered by someone who stood before an assembly and had to persuade
it. Science was the collection's smallest genre at 44 works, with antiquity
represented only from Galileo onward; with Hippocrates, Euclid, Galen, Pliny and
Vitruvius it's 66.

### Two grounds for admitting a Perseus text

The whole archive sits under CC BY-SA 4.0, but the archive isn't a license —
the same lesson [MIA teaches](sources-marxists.md). Unlike MIA, Perseus has a machine-readable
line to test against, in every file's own teiHeader. Two grounds are accepted,
and they're independent:

```
age       the source was printed more than a hundred years ago
license   the file itself states a Creative Commons license, and the source was printed by 1950 at the latest
```

Requiring _both_ would be wrong, and that's measured. Of 70 sampled English
files, 31 lack a license line entirely — 24 of them are nineteenth-century
editions, free by age several times over. Cicero's letters in Shuckburgh's 1908
translation have been free since 1976 and would have been rejected purely
because that particular file doesn't repeat the archive's license line.
Conversely, a CC line alone isn't enough over a modern edition: Bacchylides in a
1996 translation is CC-marked and still isn't admitted, because then the
license line is the only thing that distinguishes it, and that's exactly the
case the MIA lesson is about. Under the rule, 59 of the 70 are admitted.

A hundred years is an **assumed** figure, not a measured one. The protection
term on a translation is the translator's lifetime plus seventy years, and the
source only gives out the source edition's print year. The price is in the
generator's report: 98 works fell on that proxy alone, printed 1927–1950
without a license line — the whole of Lysias, and 57 of Demosthenes's 63
speeches, in Loeb editions from 1930 whose translators are, in all likelihood,
long free. They come in the day someone enters verified death years for the
translators. Guessing them would be guessing about a right.

