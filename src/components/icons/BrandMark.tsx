/**
 * The brand mark (identity §6): a half sun over two waves, drawn from public/brand/mark.svg.
 * The sun takes --color-sun and the waves --color-accent, so it follows the theme. Always
 * decorative: the link or heading around it carries the name. The header's mark plays the intro
 * (sun rises, waves draw) once per session under full motion (motion.css, R3-V14); `pathLength`
 * only scales the dash maths of that intro and changes nothing in the drawing.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="4 13 32 20"
      width="1.6em"
      height="1em"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path className="brand-mark__sun" d="M11 23a9 9 0 0 1 18 0Z" fill="var(--color-sun)" />
      <path
        className="brand-mark__waves"
        d="M5 27c2.5 0 2.5-1.6 5-1.6s2.5 1.6 5 1.6 2.5-1.6 5-1.6 2.5 1.6 5 1.6 2.5-1.6 5-1.6 2.5 1.6 5 1.6M8 31.5c2.4 0 2.4-1.4 4.8-1.4s2.4 1.4 4.8 1.4 2.4-1.4 4.8-1.4 2.4 1.4 4.8 1.4 2.4-1.4 4.8-1.4"
        pathLength={1}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
