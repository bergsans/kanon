import { describeError } from "@/lib/claude";
import { passageSourceUrl } from "@/lib/corpus";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { getContext } from "@/lib/search";

export const runtime = "nodejs";

/**
 * How far the window may extend in each direction.
 *
 * Without a cap, `?after=99999999` reads the work's entire raw file and sends
 * it as JSON — Gibbon's volumes run several megabytes each. Forty thousand
 * characters is roughly one long chapter, which is as much context a
 * citation reasonably needs.
 */
const MAX_RADIUS = 40_000;
const DEFAULT_RADIUS = 3000;

/**
 * Reads a radius from the query string. Garbage falls back to the default
 * rather than a 400: this is a convenience window in the UI, not an API
 * anyone integrates against, and a malformed number should still yield a
 * readable page.
 */
function radius(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RADIUS;
  return Math.min(Math.floor(n), MAX_RADIUS);
}

export async function GET(req: Request) {
  const locale = await getLocale();
  const params = new URL(req.url).searchParams;
  const chunkId = Number(params.get("chunkId"));
  if (!Number.isInteger(chunkId) || chunkId <= 0) {
    return Response.json({ error: t(locale, "api.badChunkId") }, { status: 400 });
  }

  try {
    const context = getContext(chunkId, {
      before: radius(params.get("before")),
      after: radius(params.get("after")),
    });
    if (!context) {
      return Response.json({ error: t(locale, "api.chunkNotFound") }, { status: 404 });
    }
    return Response.json({
      ...context,
      // Litteraturbanken's editions are CC-BY: the source must be credited
      // and linked here too, same as everywhere else a passage is shown —
      // computed here, not in `getContext`, the same split `/api/similar`
      // and `/api/work` already use, since it needs the manifest and
      // `search.ts` deliberately doesn't depend on it.
      sourceUrl: passageSourceUrl(context),
    });
  } catch (err) {
    console.error("[context]", err);
    return Response.json({ error: describeError(err, locale) }, { status: 500 });
  }
}
