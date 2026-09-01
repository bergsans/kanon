/**
 * One entry point for all the sources.
 *
 * Each source has its own fetching, its own front matter to strip, and its
 * own check that the ID points to the right place — but ingest doesn't care
 * which: it wants the work's text, or an error saying why it couldn't be had.
 */
import type { CanonWork } from "./corpus";
import * as dta from "./dta";
import * as gutenberg from "./gutenberg";
import * as litteraturbanken from "./litteraturbanken";
import * as marxists from "./marxists";
import * as perseus from "./perseus";
import * as runeberg from "./runeberg";
import * as tcp from "./tcp";
import * as wikisource from "./wikisource";

/**
 * Fetches the work's text, fully stripped and ready to chunk.
 *
 * The check against the source's own metadata is done here, not by the
 * caller: an ID pointing to the wrong edition should stop the work, not
 * silently poison the index.
 */
export async function fetchWorkText(work: CanonWork): Promise<string> {
  switch (work.source) {
    case "gutenberg": {
      const raw = await gutenberg.fetchRaw(work);
      gutenberg.verifyHeader(raw, work);
      return gutenberg.stripBoilerplate(raw);
    }
    case "litteraturbanken": {
      const raw = await litteraturbanken.fetchRaw(work);
      litteraturbanken.verifyHeader(raw, work);
      return litteraturbanken.stripBoilerplate(raw);
    }
    case "runeberg": {
      const archive = await runeberg.fetchArchive(work);
      runeberg.verifyArchive(archive, work);
      return runeberg.toText(archive, work);
    }
    case "marxists": {
      await marxists.verifyWork(work);
      return marxists.fetchWorkText(work);
    }
    case "perseus": {
      const raw = await perseus.fetchRaw(work);
      perseus.verifyHeader(raw, work);
      return perseus.toText(raw, work);
    }
    case "tcp": {
      const raw = await tcp.fetchRaw(work);
      tcp.verifyHeader(raw, work);
      return tcp.toText(raw, work);
    }
    case "dta": {
      const raw = await dta.fetchRaw(work);
      dta.verifyHeader(raw, work);
      return dta.toText(raw, work);
    }
    // The only source whose checks sit *inside* the fetch rather than before
    // it: a Wikisource work is one page per chapter, and the rights status,
    // the translator, and the proofreading grade are given per page. See `fetchWorkText`.
    case "wikisource":
      return wikisource.fetchWorkText(work);
  }
}
