"use client";

import { SegmentedControl } from "./SegmentedControl";
import { useT } from "../providers/LocaleProvider";
import { TEXT_SIZES, useTextSize, type TextSize } from "../providers/TextSizeProvider";

/** The glyph's own size per step — the row is a preview of what it sets. */
const GLYPH_SIZE: Record<TextSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

/**
 * Three "A"s, growing left to right — the reading view's font size.
 *
 * Built on `SegmentedControl`, the same strip `LocaleSwitch` uses: no
 * `useTransition` here, since this never leaves the client and there's no
 * request to wait for.
 */
export function TextSizeSwitch() {
  const { size, setSize } = useTextSize();
  const { t } = useT();

  return (
    <SegmentedControl
      ariaLabel={t("textSize.label")}
      value={size}
      onChange={setSize}
      segments={TEXT_SIZES.map((step) => ({
        value: step,
        label: (
          <span aria-hidden className={GLYPH_SIZE[step]}>
            A
          </span>
        ),
        ariaLabel: t(`textSize.${step}`),
      }))}
    />
  );
}
