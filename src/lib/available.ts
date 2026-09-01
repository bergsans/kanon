/**
 * What the collection actually offers to filter on: the subjects and eras
 * that have indexed works behind them.
 *
 * Its own module and not a function in `search.ts`. That module pulls in
 * `embed.ts` and `rerank.ts` — the embedding model and the cross-encoder —
 * and the front page shouldn't need to load them just to draw ten chips. It
 * doesn't pull in the manifest either, for the same reason `taxonomy.ts` doesn't.
 *
 * Read from `works` and not from `GENRES`/`ERAS`: the enumerations are the
 * collection's *wish list*, the table is what can actually be searched. A
 * chip for an era with no works would be a button guaranteed to return zero hits.
 */
import { getDb } from "./db";
import {
  ERAS,
  GENRES,
  type CorpusFacets,
  type Era,
  type Genre,
} from "./taxonomy";

export function availableFacets(): CorpusFacets {
  try {
    const db = getDb();
    const rows = db.prepare("select distinct genre, era from works").all() as {
      genre: Genre;
      era: Era;
    }[];
    const genres = new Set(rows.map((r) => r.genre));
    const eras = new Set(rows.map((r) => r.era));
    // The order is taken from the enumerations, not from the query result:
    // genres in the collection's own order of emphasis, eras chronologically.
    // A row of chips that changes position when a work is added reads as
    // though something happened.
    return {
      genres: GENRES.filter((g) => genres.has(g)),
      eras: ERAS.filter((e) => eras.has(e)),
    };
  } catch {
    // The database doesn't exist until `pnpm ingest` has run. Then there's
    // nothing to choose between either, and the selector isn't drawn at all.
    return { genres: [], eras: [] };
  }
}
