/**
 * Locale-specific paths for the app's own pages.
 *
 * Deliberately apart from `/s/<slug>`: that permalink stays locale-neutral
 * on purpose (see `i18n-server.ts`) because a shared link should mean the
 * same thing to sender and recipient. The corpus, the projects and the
 * cost page are navigation, not permalinks — an English session following
 * the menu should land on `/costs`, not be handed a Swedish word it never
 * chose. (`/statistik` used to be a fourth entry here; its two halves moved
 * into `/samling` and `/kostnader` — see that page's own comment — and the
 * route now only redirects, built from `corpusHref` like any other link.)
 *
 * The English segment is also the actual route folder under `src/app/`
 * (identifiers are English, same as everywhere else in the repo), so it
 * needs no rewrite. The Swedish segment is an alias that `proxy.ts` rewrites
 * to that folder — this module is what decides which spelling a `Link` gets
 * built with.
 */

import type { Locale } from "./i18n";

const SEGMENT = {
  corpus: { sv: "samling", en: "collection" },
  projects: { sv: "projekt", en: "projects" },
  costs: { sv: "kostnader", en: "costs" },
  searches: { sv: "sokningar", en: "searches" },
} satisfies Record<string, Record<Locale, string>>;

export function corpusHref(locale: Locale): string {
  return `/${SEGMENT.corpus[locale]}`;
}

export function projectsHref(locale: Locale): string {
  return `/${SEGMENT.projects[locale]}`;
}

export function projectHref(locale: Locale, slug: string): string {
  return `/${SEGMENT.projects[locale]}/${slug}`;
}

export function costsHref(locale: Locale): string {
  return `/${SEGMENT.costs[locale]}`;
}

export function searchesHref(locale: Locale): string {
  return `/${SEGMENT.searches[locale]}`;
}
