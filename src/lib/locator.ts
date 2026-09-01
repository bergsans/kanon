/**
 * A chapter heading, as an author's own markup, cleaned for display.
 *
 * Gutenberg and Runeberg's plain-text editions carry no separate metadata
 * for a heading — `chunk.ts` reads it straight out of the running text,
 * underscore emphasis and all, at ingest time. Without this, the metadata
 * row, the context view, and the exported citations show "_The Right Of The
 * State To Punish._", "Chapitre VI[250]" and "II.--My Intercourse" instead
 * of what a reader would actually write: the emphasis markup stripped, a
 * trailing page or note reference in brackets dropped, and the double
 * hyphen a typewriter used for an em dash normalized to one.
 *
 * A separate, small `lib/` module rather than living in `ui/format.ts`:
 * `citation.ts`'s exports are used with no server or DOM behind them, and
 * must not depend on `src/app/components/ui/` — this is presentation-time
 * cleanup, same as `normalizeHeading` in `chunk.ts` is ingest-time cleanup,
 * but the two run at different times on different copies of the string and
 * shouldn't be merged into one.
 */
import { stripEmphasis } from "./emphasis";

export function cleanLocator(locator: string): string {
  return stripEmphasis(locator)
    .replace(/\s*\[[^\]]*\]\s*$/, "")
    .replace(/--/g, "—")
    .trim();
}
