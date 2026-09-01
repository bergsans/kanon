import type { Metadata } from "next";
import Script from "next/script";
import { CostEstimateProvider } from "./components/providers/CostEstimateProvider";
import { LocaleProvider } from "./components/providers/LocaleProvider";
import { NavMenu } from "./components/smart-compositions/NavMenu";
import { TextSizeProvider } from "./components/providers/TextSizeProvider";
import { getLocale } from "@/lib/i18n-server";
import { bcp47, t } from "@/lib/i18n";
import { usdSek } from "@/lib/money";
import { getEffort, getProvider } from "@/lib/provider-server";
import { usageStats } from "@/lib/stats";
import { ROOT_SCALE, TEXT_SIZE_STORAGE_KEY } from "@/lib/text-size";
import "./globals.css";

/**
 * Applies a remembered "large text"/"small text" choice to `<html>` before
 * the browser paints anything — `beforeInteractive`, and therefore placed
 * in the root layout itself, per `next/script`'s own constraint. Without
 * it, the page always painted at 100% first and only jumped to the stored
 * size once `TextSizeProvider`'s effect ran on the client, a whole extra
 * paint later; the flash was worst for exactly the reader who most needed
 * the larger size to begin with.
 *
 * Built from `ROOT_SCALE`/`TEXT_SIZE_STORAGE_KEY` rather than writing the
 * percentages into the script by hand a second time — a copy here could
 * only ever drift from `TextSizeProvider`'s own mapping, silently, since
 * nothing would type-check the two against each other.
 */
function textSizeInitScript(): string {
  const map = JSON.stringify(ROOT_SCALE);
  const key = JSON.stringify(TEXT_SIZE_STORAGE_KEY);
  return `(function(){try{var s=localStorage.getItem(${key});var m=${map};if(s&&m[s])document.documentElement.style.fontSize=m[s];}catch(e){}})();`;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: `${t(locale, "app.name")} — ${t(locale, "app.tagline")}`,
    description: t(locale, "meta.description"),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The locale is read once, at the top, and passed down through context.
  // Any client component reading the cookie itself would risk rendering a
  // different string on the server than in the browser.
  //
  // All three are independent cookie reads — `Promise.all` runs them
  // concurrently instead of one after another for no reason.
  const [locale, provider, effort] = await Promise.all([
    getLocale(),
    getProvider(),
    getEffort(),
  ]);
  // The average translation cost so far, for the estimate next to "Translate
  // into Swedish" — see `CostEstimateProvider`. Read once here rather than
  // per-passage: `usageStats` sums the whole `translations` table, and a
  // page with sixteen passages doesn't need sixteen identical queries.
  const usage = usageStats();
  const avgTranslationUsd =
    usage.translations > 0 ? usage.translationCost / usage.translations : null;
  // Same reasoning as `avgTranslationUsd` above, for the estimate under the
  // search box — see `CostEstimateProvider`. `usage.spent` already sums
  // every search's cost, and a local search always stores 0 (`localStep`
  // in local.ts), so dividing by `claudeSearches` rather than `searches`
  // is the only difference from `avgTranslationUsd`'s own line: summing
  // across every row and across Claude's rows alone give the same total,
  // since the local rows contribute nothing to it either way.
  const avgSearchUsd =
    usage.claudeSearches > 0 ? usage.spent / usage.claudeSearches : null;

  return (
    // suppressHydrationWarning: the inline script below deliberately sets
    // `<html>`'s inline `font-size` before React ever hydrates, so the
    // server-rendered markup (which has none) and the live DOM disagree on
    // that one attribute by design — this only silences the mismatch
    // warning for `<html>` itself, not for anything React actually renders.
    <html lang={bcp47(locale)} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Script id="text-size-init" strategy="beforeInteractive">
          {textSizeInitScript()}
        </Script>
        <LocaleProvider locale={locale}>
          <TextSizeProvider>
            <CostEstimateProvider
              avgTranslationUsd={avgTranslationUsd}
              avgSearchUsd={avgSearchUsd}
              provider={provider}
              rate={usdSek()}
            >
              {/* Fixed in the corner, once for all pages — see the reasoning in NavMenu.tsx.
                  The model and effort switches live in its slide-out panel now, not as a
                  second fixed-corner control, so their initial cookie values pass through here too. */}
              <NavMenu provider={provider} effort={effort} />
              {children}
            </CostEstimateProvider>
          </TextSizeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
