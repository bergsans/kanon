"use client";

/**
 * The bordered strip of segments shared by every "pick one of N views"
 * control in the header: text size, language, and the results list's sort
 * order. All three used to carry their own copy of this markup, and the
 * sort toggle's copy had drifted into the accent chip's own look — full
 * accent border, a twelve-percent accent fill, bold accent-colored text —
 * indistinguishable at a glance from a genre or era chip actually narrowing
 * the search, in the same results header where those chips' own summary
 * line sits (`subjects.selected`). Reading order versus reading subject
 * look identical there even though only one of them is a decision about
 * what the question was asked of.
 *
 * Weight now carries the difference everywhere instead: bold ink-900 text
 * plus a 2px accent rule along the bottom, drawn with an inset shadow
 * rather than a border so it can't nudge the label up by eating into the
 * button's padding — the same reasoning `TextSizeSwitch` and `LocaleSwitch`
 * already carried in their own comments before this became one component.
 * The accent stays reserved for what it means everywhere else in the app: a
 * mark (a rule, a border) on settings, a fill only on the query itself.
 */
export function SegmentedControl<T extends string>({
  ariaLabel,
  segments,
  value,
  onChange,
  disabled,
}: {
  ariaLabel: string;
  segments: {
    value: T;
    label: React.ReactNode;
    /** Overrides the accessible name — needed wherever `label` is itself `aria-hidden`, like the text-size glyphs. */
    ariaLabel?: string;
    lang?: string;
  }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex h-6 border border-parchment-300 text-xs"
    >
      {segments.map((segment, i) => (
        <button
          key={segment.value}
          type="button"
          lang={segment.lang}
          onClick={() => onChange(segment.value)}
          aria-pressed={segment.value === value}
          aria-label={segment.ariaLabel}
          disabled={disabled}
          className={`flex cursor-pointer items-center justify-center px-3 transition disabled:cursor-wait disabled:opacity-60 ${
            i > 0 ? "border-l border-parchment-300" : ""
          } ${
            segment.value === value
              ? "font-semibold text-ink-900 shadow-[inset_0_-2px_0_0_var(--color-accent-600)]"
              : "text-ink-600 hover:text-accent-700"
          }`}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
