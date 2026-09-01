/**
 * The language choice, read from the cookie.
 *
 * Kept apart from `i18n.ts` because `next/headers` only exists on the
 * server: the dictionary is imported by client components, and this file
 * must never follow it there.
 *
 * The cookie, not the URL. A permalink should point at *the answer*, not at
 * the answer in a particular language dress — /s/<slug> is the same page
 * regardless of who opens it, and a shared link would otherwise force the
 * sender's language onto the recipient.
 */

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./i18n";

/**
 * Reads the language out of the request. Works in server components and in
 * route handlers — error messages from the API should come in the same
 * language as the button that triggered them.
 *
 * The call makes the route dynamic. The pages here are already
 * `force-dynamic` (the archive lives in SQLite and grows while the app
 * runs), so this costs nothing new.
 */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
