# Language (interface i18n)

[← back to README](../../README.md)

### Language

The interface exists in Swedish (default) and English. The choice lives in the
`canon-locale` cookie, is read by `getLocale()` in `src/lib/i18n-server.ts`, and
is passed down through `LocaleProvider` — not in the URL, since a permalink
should point at the answer, not at the answer in a particular language dress.

The dictionary in `src/lib/i18n.ts` is typed off the Swedish one: a key missing
from the English one is a compile error, so `pnpm typecheck` is also the check
on the translations.

**Only the shell is localized.** Claude's rationales come out in Swedish no
matter which interface is shown, and the translate button still translates
_into_ Swedish. Localizing them would require keying the semantic cache on
language too — otherwise a Swedish rationale gets served to an English session
— and that's a change to the chain, not to the interface.

