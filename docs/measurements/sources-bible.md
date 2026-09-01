# Scripture numbers itself

[← back to README](../../README.md)

### Scripture numbers itself

The Bible has been in the collection the whole time — Gutenberg's King James
Version, a work in `EXTRA` under the traditional name "The Bible" — and it was
searchable. It just couldn't be _looked up_: all 5,416 passages had
`locator: null`. In the one work where chapter and verse are the citation, it
read "The Bible, The King James Version of the Bible" and nothing more, which
says about as much as "Plato, Writings".

The reason is that scripture is the collection's only work that puts its
divisions in the body text instead of in headings. The chapters have no line of
their own at all — they appear as verse numbers, "1:1 In the beginning" — and
the book lines carry the keyword in the middle: _The First Book of Moses:
Called Genesis_, where BOOK sits at position 10 and the line isn't uppercase.
`looksLikeHeading` requires either position 0 or an uppercase line, so none of
the 66 books counted as a heading.

Loosening the English heading rule wasn't the way. A keyword allowed to sit
anywhere in a short line turns every line of dialogue under ninety characters
that happens to contain "book" into a heading — and the chapters still
wouldn't have been caught, since they have no line to recognize at all. The
form is instead distinctive enough to be recognized on its own, and `chunk.ts`
does exactly that: a text whose passages are more than half `chapter:verse` at
the start, with at least 500 of them, is chunked as scripture.

**The threshold is measured, not set.** `.probe-bible-locator.ts` counts
verse-numbered passages across all 2,335 fetched texts in `data/texts`:

| work                             | verse-numbered passages | out of total | share |
| ---------------------------------- | -------------------------- | -------------- | ------ |
| The Bible, KJV                      | 24,404                      | 24,610          | 99.2%  |
| Stiernstedt, _Bland människor_      | 5                            | 2,718           | 0.2%   |
| Twain, _What Is Man?_               | 1                            | 1,891           | 0.1%   |

Runner-up to the Bible is five numbered letter headings in Stiernstedt. The
margin to the threshold is four orders of magnitude, and that the form — not
the work's ID — decides means a Bible from a different source or in a
different language gets citations without any line being added.

The book boundary is `1:1` and nothing else: the verse occurs exactly once per
book and never inside one. The heading sits in the cluster of non-verse lines
immediately before it — but not last in it, and that's the whole difficulty.
The First Book of Samuel follows its heading with its own alternate title
("Otherwise Called: The First Book of the Kings"), and Ecclesiastes with its
("or The Preacher"), so the line closest to `1:1` gives Samuel the name Kings.
The cluster's _first_ heading line is the book's name.

The name is also shortened to the form a citation is written in. KJV's own
line reads "The First Epistle of Paul the Apostle to the Corinthians", which
with a chapter number becomes 58 characters in a column where `shortLocator`
cuts at 44 — and no one cites it that way. The citation is _1 Corinthians 13_,
and it can be looked up in any edition in any language. When a line falls
through every rule, the citation becomes the heading as printed: worse, but
never wrong.

The outcome: **66 books, 1,189 chapters, a citation on 100% of the passages.**
The passage count goes from 5,416 to 5,820, since the chapter break splits the
chunk — a passage can't span two chapters when it's the chapter that gets
cited. The list of Bible books at the top of the file becomes the only two
front-matter passages.

