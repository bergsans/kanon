"use client";

/*
 * Selected chip versus unselected. The difference used to be carried by a
 * ten-percent fill and an equally thin border, and two chips side by side
 * then looked almost identical — which is the one thing a chip has to do.
 * Now three things differ at once: the accent border is at full strength,
 * the fill is twice as strong, and the selected chip sits on the sheet
 * while the unselected one sits on the ground.
 *
 * The color is the accent, the same rust as the search button. It sat for a
 * while in a separate green to distinguish "selected" from "clickable", but
 * the distinction is already carried by the three things above — a filled
 * button and a chip with a border and weak fill don't read as the same kind
 * of control just because they share ink. The reasoning is in `@theme` in
 * globals.css, along with what the change did to contrast. The hover state
 * on the unselected chip carries the same color: it shows what will happen,
 * and a chip that promises one color and becomes another is two promises.
 */
const chipClass = (active: boolean) =>
  active
    ? "border border-accent-600 bg-accent-600/12 px-3 py-1.5 text-xs font-semibold text-accent-700 transition disabled:opacity-50"
    : "cursor-pointer border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs text-ink-600 transition hover:border-accent-600 hover:bg-parchment-100 hover:text-accent-700 disabled:opacity-50";

/*
 * The "all" pseudo-chip is not the same kind of selected as a genre or an
 * era chip, and it shouldn't wear the same accent. "All subjects" is the
 * box's rest state, true before anyone has touched the filter at all — the
 * strongest color on an untouched page then belonged to the two chips that
 * say nothing is being narrowed, which is backwards: the accent should mark
 * an actual restriction, not its absence. Selected here reads as plain bold
 * ink instead, the same weight-carries-the-difference move `TextSizeSwitch`
 * and `LocaleSwitch` make for a setting rather than a query. Unselected
 * falls back to the ordinary chip look — at that point some other chip in
 * the row *is* narrowing the search, and "all" is back to being an ordinary
 * clickable option (clear the filter), not a state of its own.
 */
const allChipClass = (active: boolean) =>
  active
    ? "border border-parchment-300 bg-parchment-100 px-3 py-1.5 text-xs font-semibold text-ink-800 transition disabled:opacity-50"
    : chipClass(false);

/**
 * A row of chips for one of the filter's two axes.
 *
 * Generic over the value because the rows should behave *identically*:
 * genre and era are two independent questions to the same corpus, and two
 * rows that deselected or normalized differently would be a UI where you
 * have to remember which one you're in.
 */
export function ChipRow<T extends string>({
  label,
  allLabel,
  options,
  selected,
  onChange,
  busy,
  labelOf,
}: {
  label: string;
  allLabel: string;
  options: T[];
  selected: T[];
  onChange: (next: T[]) => void;
  busy: boolean;
  labelOf: (value: T) => string;
}) {
  const toggle = (value: T) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    // All selected is the same search as none selected — but only one of
    // those is the form the chain expects, and two spellings of the same
    // selection wouldn't share a cache with each other. The normalization
    // happens here, not just on the server: otherwise the chips would stay
    // "five of six selected" when the search was in fact for all of them.
    onChange(next.length === options.length ? [] : next);
  };

  return (
    /* The spacing and hairline are set on the row, not the container: the
       axes are conditional, and `first`/`last` mean the sole row in a
       collection with only one axis gets neither a line above it nor
       spacing it doesn't need.

       `items-start`, not `items-center`: the row now holds two flex
       children — the label and the chip group below — and centering
       would vertically center the label against the *whole* block once
       the chips wrap to a second line, not against the first line where
       it belongs. */
    <div
      className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0"
      role="group"
      aria-label={label}
    >
      {/* Fixed width so the two rows' labels start at the same x position:
          two rows that drift apart read as two different kinds of control.
          The width is set to fit the longest label in both languages,
          "SUBJECT". `py-1.5` matches the chips' own vertical padding
          below, so the label's text lines up with the first row of chips
          instead of the empty space above it. */}
      <span className="w-16 shrink-0 py-1.5 text-xs font-semibold uppercase tracking-widest text-ink-600">
        {label}
      </span>
      {/* The chips wrap inside their own flex container, not as the
         label's direct siblings: with nine genre chips and the label all
         in one `flex-wrap` row, a wrapped second line restarted at the
         row's left edge — under the label, not under the first chip —
         and read as an unlabeled row of its own. `min-w-0` overrides the
         default flex-item floor (an item won't shrink past its content's
         width otherwise), which is what lets this container actually
         give up the width the label took and wrap where the frame ends
         instead of overflowing it. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={busy}
          aria-pressed={selected.length === 0}
          className={allChipClass(selected.length === 0)}
        >
          {allLabel}
        </button>
        {options.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            disabled={busy}
            aria-pressed={selected.includes(value)}
            className={chipClass(selected.includes(value))}
          >
            {labelOf(value)}
          </button>
        ))}
      </div>
    </div>
  );
}
