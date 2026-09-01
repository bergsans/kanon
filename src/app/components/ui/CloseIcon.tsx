/**
 * The close mark, drawn once and shared by every panel that closes with it —
 * the hamburger menu, the context sheet, the cost breakdown.
 *
 * It used to be this same drawn SVG in the menu and a plain "×" character in
 * the two modals. A character glyph renders at whatever weight and baseline
 * the installed font happens to give it, so the same "close" affordance
 * looked like two different marks depending on which panel you were in; the
 * drawn stroke looks identical everywhere regardless of font.
 */
export function CloseIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 22 22"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
      className="block"
    >
      <path d="M5.5 5.5 16.5 16.5" />
      <path d="M16.5 5.5 5.5 16.5" />
    </svg>
  );
}
