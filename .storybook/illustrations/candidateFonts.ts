import {
  Archivo,
  Cormorant_Garamond,
  Crimson_Pro,
  EB_Garamond,
  Libre_Caslon_Text,
  Libre_Franklin,
  Manrope,
  Newsreader,
  Public_Sans,
} from "next/font/google";

/**
 * next/font/google self-hosts at build time — no runtime request to Google,
 * no npm package — so trying a pairing on Design guide/Foundations/Typography
 * costs nothing beyond this file. `.style.fontFamily` is the resolved family
 * name (plus its fallback stack); calling the font function is what makes
 * the compiler bundle the actual `@font-face`, independent of how the
 * return value below is used.
 *
 * Screened for the app's own subject rather than for UI fashion: this is a
 * search over the Western canon, so a Garamond or Caslon revival — the
 * actual lineage most of that canon was set in print — reads as more fitting
 * than a general-purpose editorial serif, and the sans partners were picked
 * to stay quiet enough not to fight that.
 */
const ebGaramond = EB_Garamond({ subsets: ["latin", "latin-ext"] });
const crimsonPro = Crimson_Pro({ subsets: ["latin", "latin-ext"] });
const libreCaslonText = Libre_Caslon_Text({ subsets: ["latin", "latin-ext"], weight: ["400"] });
const cormorantGaramond = Cormorant_Garamond({ subsets: ["latin", "latin-ext"], weight: ["500"] });
const newsreader = Newsreader({ subsets: ["latin", "latin-ext"] });

const libreFranklin = Libre_Franklin({ subsets: ["latin", "latin-ext"] });
const manrope = Manrope({ subsets: ["latin", "latin-ext"] });
const archivo = Archivo({ subsets: ["latin", "latin-ext"] });
const publicSans = Public_Sans({ subsets: ["latin", "latin-ext"] });

export type FontPairing = { name: string; note: string; serif?: string; sans?: string };

/**
 * Five pairings, not nine independent fonts — the app's rule is a matched
 * serif/sans pair, so a proposal only means something as a set.
 */
export const PAIRINGS: FontPairing[] = [
  {
    name: "EB Garamond + Libre Franklin",
    note: "Garamond is the lineage most of the canon was actually set in print; Libre Franklin keeps the chrome quiet rather than techy",
    serif: ebGaramond.style.fontFamily,
    sans: libreFranklin.style.fontFamily,
  },
  {
    name: "Crimson Pro + Manrope",
    note: "a warm old-style book face against a soft, modern geometric sans",
    serif: crimsonPro.style.fontFamily,
    sans: manrope.style.fontFamily,
  },
  {
    name: "Libre Caslon Text + Archivo",
    note: "Caslon's centuries-old \"when in doubt\" pedigree, fitting for a canon of source texts, against a versatile grotesque",
    serif: libreCaslonText.style.fontFamily,
    sans: archivo.style.fontFamily,
  },
  {
    name: "Newsreader + Public Sans",
    note: "both drawn for plain, long-form legibility over character",
    serif: newsreader.style.fontFamily,
    sans: publicSans.style.fontFamily,
  },
  {
    name: "Cormorant Garamond + Libre Franklin",
    note: "the most delicate, highest-contrast option — worth checking whether its hairlines still hold at the 15 px neighbor-row size",
    serif: cormorantGaramond.style.fontFamily,
    sans: libreFranklin.style.fontFamily,
  },
];

/**
 * The system stack as it stands today, prepended so every size-by-size
 * table below carries it as the baseline the five candidates are measured
 * against, without a special case at each call site.
 */
export const TODAY: FontPairing = { name: "Today", note: "the current system stack, for comparison" };
export const ALL_PAIRINGS: FontPairing[] = [TODAY, ...PAIRINGS];
