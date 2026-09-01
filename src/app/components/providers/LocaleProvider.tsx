"use client";

import { createContext, use, useMemo } from "react";
import {
  costLabel,
  DEFAULT_LOCALE,
  formatEra,
  formatNumber,
  formatYear,
  t,
  tn,
  type Key,
  type Locale,
} from "@/lib/i18n";

/**
 * The locale, passed down through the client tree.
 *
 * The server reads the cookie once in the layout and sends the value down.
 * Letting every client component read `document.cookie` itself would give
 * two truths: the server's at first render and the browser's afterward,
 * and the mismatch shows up as a hydration warning in the console and as a
 * flash on screen.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return use(LocaleContext);
}

/**
 * The dictionary bound to the session's locale.
 *
 * Calls become `t("search.submit")` instead of `t(locale, "search.submit")`.
 * It's not just shorter: the locale is a property of the session, not of
 * each individual string, and a component free to pick a locale per call
 * would sooner or later pick the wrong one somewhere.
 */
export function useT() {
  const locale = useLocale();
  return useMemo(
    () => ({
      locale,
      t: (key: Key, vars?: Record<string, string | number>) =>
        t(locale, key, vars),
      tn: (
        base: Parameters<typeof tn>[1],
        count: number,
        vars?: Record<string, string | number>,
      ) => tn(locale, base, count, vars),
      num: (value: number) => formatNumber(value, locale),
      /**
       * "d. 1830 e.v.t." / "d. 1830" — every call site that shows this
       * figure next to a passage or a work needs the "died" framing
       * (`year.death` in i18n.ts): the number is the author's year of
       * death, the same across all ten sources (see `CanonWork.year` in
       * taxonomy.ts), never the work's own date. No bare `era`/`year`
       * alongside these: every component that reads this hook wants the
       * "died" framing, and the one caller that doesn't — `citation.ts`'s
       * BibTeX/RIS export, which already spells "died" out as a full
       * sentence — is a pure module and calls `formatEra`/`formatYear`
       * from `@/lib/i18n` directly, not through this hook.
       */
      deathEra: (year: number) => t(locale, "year.death", { year: formatEra(year, locale) }),
      deathYear: (year: number) => t(locale, "year.death", { year: formatYear(year, locale) }),
      costLabel: (kind: "step" | "line", swedish: string) =>
        costLabel(locale, kind, swedish),
    }),
    [locale],
  );
}
