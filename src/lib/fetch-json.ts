/**
 * `res.json()`, but a response that isn't valid JSON — an HTML error page
 * from a proxy in front of the app, a framework's default 500, a truncated
 * body — throws a typed `ApiError` instead of letting a raw `SyntaxError`
 * ("Unexpected token < in JSON at position 0") reach the UI. Every client
 * component that calls a JSON route repeats the same three-line shape
 * (`fetch` → `res.json()` → check `error` field), and none of them guarded
 * the parse step, so a broken response showed a parser's own words instead
 * of a sentence written for a reader.
 *
 * Callers still check `res.ok` and any `error` field on the parsed body
 * themselves — this only guards the one step that used to leak parser
 * internals, and stays a thin wrapper rather than a second error-shape
 * convention layered on top of the routes' existing `{error: string}`.
 */
export class ApiError extends Error {
  constructor() {
    super("Response was not valid JSON");
    this.name = "ApiError";
  }
}

export async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError();
  }
}
