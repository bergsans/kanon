import { describeError } from "@/lib/claude";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { costPayload } from "@/lib/money";
import { AlreadySwedishError, translateChunk } from "@/lib/translate";

// better-sqlite3 is native — this route cannot run on the edge.
export const runtime = "nodejs";

/**
 * Translates a passage to Swedish on request.
 *
 * Takes only a chunk ID, never the text: the text lives in the database, and
 * a client allowed to submit arbitrary text would turn the route into an
 * open translation service billed to the house API key.
 */
export async function POST(req: Request) {
  const locale = await getLocale();

  let chunkId: number;
  try {
    const body = (await req.json()) as { chunkId?: unknown };
    chunkId = Number(body.chunkId);
  } catch {
    return Response.json({ error: t(locale, "api.invalidJson") }, { status: 400 });
  }

  if (!Number.isInteger(chunkId) || chunkId <= 0) {
    return Response.json({ error: t(locale, "api.badChunkId") }, { status: 400 });
  }

  try {
    const translation = await translateChunk(chunkId);
    if (!translation) {
      return Response.json({ error: t(locale, "api.chunkNotFound") }, { status: 404 });
    }
    // Same shape of cost record as the search sends, so the UI can show it
    // with the same component: a saved translation costs nothing now and
    // cost something then.
    return Response.json({
      text: translation.text,
      cached: translation.cached,
      // The model that actually produced this translation — read back from
      // the row on a cache hit, not necessarily the one `CANON_MODEL` names
      // today. See `Translation.model`'s own comment in translate.ts.
      cost: costPayload(translation.steps, translation.model, {
        cached: translation.cached,
        originalUsd: translation.cost,
      }),
    });
  } catch (err) {
    if (err instanceof AlreadySwedishError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("[translate]", err);
    return Response.json({ error: describeError(err, locale) }, { status: 500 });
  }
}
