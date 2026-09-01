# Two sources that were tried and didn't work out

[← back to README](../../README.md)

### Two sources that were tried and didn't work out

**Deutsche Digitale Bibliothek** is a metadata aggregator, not a text archive:
its APIs hand out catalog records, and the one open field with full text —
the newspaper index — is unread Fraktur OCR, the same kind of unusable text
Projekt Runeberg rejects. **HathiTrust** hands out catalog and rights metadata
per volume through its one open API; the text itself sits behind
`babel.hathitrust.org` (403 on every machine request) or a Data API restricted
to member institutions, and going around either would mean bypassing an access
control — exactly what `marxists.ts` exists to not do. Neither source gives
the app anything to actually answer a question with, and what's free at either
is almost always already at Gutenberg, proofread rather than OCR'd.
`pnpm tsx scripts/.probe-ddb-hathitrust.ts` queries both and prints the
answers, so the conclusion can be rerun the day something changes.

