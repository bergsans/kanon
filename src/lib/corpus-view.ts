/**
 * The shapes `/samling` groups the corpus into, shared with `CorpusBrowser`.
 *
 * Kept out of `app/collection/page.tsx`: a `components/smart-compositions` file reaching
 * into a route's `page.tsx` for its prop types made the UI layer depend on
 * app routing structure instead of on `src/lib`, same as every other typed
 * boundary in the app.
 */

import type { Era, Genre, Source } from "./taxonomy";

export interface Entry {
  id: string;
  author: string;
  title: string;
  translator: string | null;
  year: number;
  genre: Genre;
  era: Era;
  source: Source;
  sourceId: string;
  /** The link to the source's edition, already resolved — see `WorkTitle` in `CorpusBrowser`. */
  href: string | null;
}

export interface AuthorGroup {
  author: string;
  works: Entry[];
}

/** Which of the three ways to slice the corpus a `Section` groups by. */
export type SectionKind = "genre" | "era" | "letter";

export interface Section {
  kind: SectionKind;
  /** The genre, the era, or the author's first letter — `CorpusBrowser` resolves the label. */
  key: string;
  authors: AuthorGroup[];
  works: number;
}
