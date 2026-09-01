"use client";

import { useTransition } from "react";
import { LOCALES, LOCALE_NAME, type Locale } from "@/lib/i18n";
import { setLocale } from "../../actions";
import { SegmentedControl } from "../ui/SegmentedControl";
import { useLocale, useT } from "../providers/LocaleProvider";

/**
 * The locale switch, as two words side by side.
 *
 * Not a select, and no flags. Two languages fit the row as they are, and a
 * flag stands for a country, not a language — the English in this app
 * isn't British, it's the corpus's.
 *
 * The names are set in their own language: someone looking for English is
 * looking for the word "English", not "engelska".
 *
 * Built on `SegmentedControl`, the same strip `TextSizeSwitch` uses.
 */
export function LocaleSwitch() {
  const active = useLocale();
  const { t } = useT();
  const [pending, startTransition] = useTransition();

  const choose = (locale: Locale) => {
    if (locale === active || pending) return;
    startTransition(async () => {
      await setLocale(locale);
    });
  };

  return (
    <SegmentedControl
      ariaLabel={t("locale.label")}
      value={active}
      onChange={choose}
      disabled={pending}
      segments={LOCALES.map((locale) => ({
        value: locale,
        label: LOCALE_NAME[locale],
        lang: locale,
      }))}
    />
  );
}
