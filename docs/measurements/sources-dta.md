# Deutsches Textarchiv

[← back to README](../../README.md)

**Deutsches Textarchiv** is the collection's first German-language source, and
the reason is in this very file's own error analysis further down. Hegel's §
548 — history as the progress of the consciousness of freedom — never surfaces
in search, and the cause isn't the chain but the text: Wallace translates
_Geist_ as "mind", and the word "progress" isn't in the English wording. In
German, _Fortschritt im Bewußtsein der Freiheit_ is verbatim what the question
is looking for. The conclusion was that the next lever is the collection — and
this is that lever.

The texts are TEI under CC BY-SA, with the license line in every file. Three
things in the eighteenth- and nineteenth-century print need correcting, all
measured on Kant's _Critik der reinen Vernunft_, 1781:

```
47,108   long s (ſ)                "erſte" never matches "erste" in BM25
11,897   vowel + overwritten e     "kuͤnftigen" is not "künftigen"
 6,807   line-break hyphen         of 24,095 lines, 28% end mid-word
```

The first two are purely typographic. The third is structural, and it was
subtle: `<lb/>` after a hyphen is supposed to rejoin the word — but the source
file also has a line break _after_ the tag, so "wirk-<lb/>\nliche" became
"wirk\nliche" until that too was swallowed. Hegel's _Phänomenologie_ read "an
das wirk liche Erkennen" before the bug was found.

The license check also needed fixing, and it's the same kind of bug as TCP's
status column: of 271 fetched files, every single one is free, but they say so
five different ways. A regex that only looked for "Creative Commons" rejected
Hölderlin's _Hyperion_ — whose line reads, plainly, "CC BY-SA 4.0" — and six
works whose line says "gemeinfrei", meaning freer than CC.

