/**
 * Money in the UI.
 *
 * The bill at Anthropic is in dollars, and the dollar is the true figure —
 * the kronor are a reading aid for someone who doesn't carry the rate in
 * their head. Both are shown next to the question.
 *
 * The formatting lives here and not in the components for one reason: the
 * same amount is written in three places (the line next to the question, the
 * table in the modal, the total at the bottom), and three separate toFixed
 * calls would have given three different figures for the same cost.
 */

import { bcp47, type Locale } from "./i18n";
import type { CostPayload, CostStep } from "./protocol";

/**
 * The dollar → krona rate.
 *
 * A constant on purpose. The alternative would be fetching the day's rate on
 * every search: one more network call and one more source of failure, for a
 * few öre nobody makes a decision on. The number is approximate and ages —
 * set CANON_USD_SEK in .env.local once it's drifted too far.
 */
export const FALLBACK_USD_SEK = 9.6;

/**
 * The rate the server computes with. Read only on the server and sent along
 * in the response, so the amount in the modal and the amount in the line
 * above come from the same figure — a client reading the rate itself could
 * end up showing something different.
 */
export function usdSek(): number {
  const rate = Number(process.env.CANON_USD_SEK);
  return Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_USD_SEK;
}

function fixed(value: number, digits: number, locale: Locale): string {
  return value.toLocaleString(bcp47(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Amounts bound to the UI language.
 *
 * One factory and not four functions each with a language parameter: the
 * cost modal writes the same amount in a dozen places, and a single
 * forgotten parameter would have given a table with a decimal comma in one
 * row and a decimal point in the next. Here the language sits in the
 * closure and can't be left out.
 *
 * The krona amounts remain in both language versions. The rate is the
 * server's and the conversion is a reading aid — someone reading the UI in
 * English still pays in the same currency as someone reading it in Swedish.
 */
export function money(locale: Locale) {
  return {
    /**
     * Four decimals. A whole search costs a few hundredths of a dollar and a
     * single line thousandths — rounded to cents, half the table becomes zeros.
     */
    usd(usd: number): string {
      if (usd <= 0) return "$0";
      if (usd < 0.0001) return `<$${fixed(0.0001, 4, locale)}`;
      return `$${fixed(usd, 4, locale)}`;
    },

    /** Kronor with öre, and three decimals for the lines that don't reach one öre. */
    sek(sek: number): string {
      const unit = locale === "en" ? "SEK" : "kr";
      if (sek <= 0) return `0 ${unit}`;
      if (sek < 0.001) return `<${fixed(0.001, 3, locale)} ${unit}`;
      return `${fixed(sek, sek < 0.1 ? 3 : 2, locale)} ${unit}`;
    },

    /** The price per million tokens, as it appears in the pricing table: $2.00, $0.20. */
    perMillion(perMillion: number): string {
      return `$${fixed(perMillion, 2, locale)}`;
    },

    tokens(tokens: number): string {
      return tokens.toLocaleString(bcp47(locale));
    },

    /**
     * Wall-clock time a query took. Below a minute, one decimal — a Claude
     * round trip runs to several seconds, so tenths are the resolution worth
     * showing, and milliseconds would be false precision on a number that
     * varies with Anthropic's load from one query to the next. At a minute
     * or more — routine for a local model, and not rare for Claude either —
     * a decimal on top of two or three digits of seconds stops being
     * legible at a glance, so it switches to whole minutes and seconds:
     * "142,9 s" and "2 min 23 s" name the same wait, but only one of them
     * is read without doing the division yourself.
     */
    duration(ms: number): string {
      const seconds = ms / 1000;
      if (seconds < 60) return `${fixed(seconds, 1, locale)} s`;
      // Round the total first, then split — rounding minutes and seconds
      // separately can carry a 59.6s remainder up to "60 s" instead of
      // rolling it into the next minute.
      const rounded = Math.round(seconds);
      const minutes = Math.floor(rounded / 60);
      const rest = rounded % 60;
      return `${minutes} min ${rest} s`;
    },
  };
}

/**
 * The bill as the UI receives it.
 *
 * The rate is set here and only here. An answer from the archive costs zero
 * now but cost something once — `originalUsd` carries that figure, so a
 * cache hit can say both "this cost nothing" and "here's how much you saved."
 */
export function costPayload(
  steps: CostStep[],
  model: string,
  { cached, originalUsd }: { cached: boolean; originalUsd?: number },
): CostPayload {
  const sum = steps.reduce((total, step) => total + step.cost, 0);
  return {
    steps,
    model,
    usd: cached ? 0 : sum,
    originalUsd: originalUsd ?? sum,
    rate: usdSek(),
    cached,
  };
}
