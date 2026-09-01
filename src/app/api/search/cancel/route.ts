import { cancelSearch } from "@/lib/search-registry";

/**
 * Stops an in-flight search early — the only thing that still can, now that
 * the pipeline itself runs independent of the request that started it (see
 * `search-registry.ts` and the comment above `pipelineAbort` in
 * `../route.ts`).
 *
 * No `runtime = "nodejs"` export: this route touches neither SQLite nor the
 * embedding model, only the in-memory registry, which is available wherever
 * `search-registry.ts`'s module scope lives — the same process as the
 * search route it cancels.
 *
 * No auth to check: the app has none, and a token is only ever handed to
 * the browser that started the search it names — there's nothing to gain
 * by guessing someone else's.
 */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const cancelled = token ? cancelSearch(token) : false;
  return Response.json({ cancelled });
}
