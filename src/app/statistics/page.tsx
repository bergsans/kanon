import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n-server";
import { corpusHref } from "@/lib/routes";

// Reads the cookie, so this can't be statically prerendered anyway — same
// as every other page that calls `getLocale()`.
export const dynamic = "force-dynamic";

/**
 * `/statistik` no longer exists as its own page.
 *
 * The collection's distribution moved to the top of `/samling`, where the
 * corpus's own totals already stood — a bar chart of what the corpus
 * contains belongs next to the count of what it contains, not a menu item
 * away from it. What the searches have cost moved to `/kostnader`, next to
 * the bill those searches produced. The menu is four items now (search,
 * collection, projects, costs) instead of five, and this route stays only
 * so an old bookmark or a link out in the world still lands somewhere real
 * instead of a 404.
 */
export default async function StatsRedirect() {
  const locale = await getLocale();
  redirect(corpusHref(locale));
}
