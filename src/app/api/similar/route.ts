import { describeError } from "@/lib/claude";
import { similarChunks } from "@/lib/search";
import { passageSourceUrl } from "@/lib/corpus";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

// sqlite-vec is native — this route cannot run on the edge.
export const runtime = "nodejs";

/**
 * The neighbors of a passage: the same thing said by someone else.
 *
 * Costs nothing. The passage's embedding is already computed and sits in the
 * index, so the answer is a KNN and a join — no new embedding, no call to
 * Claude, and therefore no cost record to send along. That's the whole point
 * of the feature: a way onward from an answer that doesn't require paying for
 * a new search.
 */
const LIMIT = 6;

export async function GET(req: Request) {
  const locale = await getLocale();
  const chunkId = Number(new URL(req.url).searchParams.get("chunkId"));
  if (!Number.isInteger(chunkId) || chunkId <= 0) {
    return Response.json({ error: t(locale, "api.badChunkId") }, { status: 400 });
  }

  try {
    const passages = similarChunks(chunkId, LIMIT).map((p) => ({
      ...p,
      // Litteraturbanken's editions are CC-BY: the source must be credited
      // and linked here too, not just in the hit list.
      sourceUrl: passageSourceUrl(p),
    }));
    return Response.json({ passages });
  } catch (err) {
    console.error("[similar]", err);
    return Response.json({ error: describeError(err, locale) }, { status: 500 });
  }
}
