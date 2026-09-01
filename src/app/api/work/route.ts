import { describeError } from "@/lib/claude";
import { moreFromWork } from "@/lib/search";
import { loadSearch } from "@/lib/searches";
import { passageSourceUrl } from "@/lib/corpus";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

// better-sqlite3 and onnxruntime are native — this route cannot run on the edge.
export const runtime = "nodejs";

/**
 * More passages from a work that has already answered.
 *
 * Costs nothing: retrieval is a scan of the work's own passages, and
 * reranking is the cross-encoder, both local. No row goes to Claude, so
 * there's no cost record to send along.
 *
 * The search is identified by its slug rather than its query, and that's not
 * just convenience: the saved row carries the query in the corpus's six
 * languages, which reranking needs, and it carries which passages already
 * appear in the answer. Both are things the server should read out of its own
 * archive rather than accept from the client — otherwise it could be asked to
 * rerank against arbitrary text.
 */
const LIMIT = 8;

export async function GET(req: Request) {
  const locale = await getLocale();
  const params = new URL(req.url).searchParams;
  const slug = params.get("slug") ?? "";
  const workId = params.get("workId") ?? "";

  if (!slug || !workId) {
    return Response.json({ error: t(locale, "api.badWork") }, { status: 400 });
  }

  try {
    const search = loadSearch(slug);
    if (!search) {
      return Response.json(
        { error: t(locale, "api.searchNotFound") },
        { status: 404 },
      );
    }

    const passages = await moreFromWork({
      workId,
      queries: search.queries,
      // The passages from the work that are already in the answer. Showing
      // them again would mean answering with what was just read.
      exclude: search.passages
        .filter((p) => p.workId === workId)
        .map((p) => p.chunkId),
      limit: LIMIT,
    });

    return Response.json({
      passages: passages.map((p) => ({
        ...p,
        // Litteraturbanken's editions are CC-BY: the source must be credited
        // and linked here too, not just in the hit list.
        sourceUrl: passageSourceUrl(p),
      })),
    });
  } catch (err) {
    console.error("[work]", err);
    return Response.json({ error: describeError(err, locale) }, { status: 500 });
  }
}
