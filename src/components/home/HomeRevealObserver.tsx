"use client";

import { useEffect } from 'react';

/** M6, M8, M10 and M12 reveal once the element's top is past this share of the viewport (§5.5). */
const DEFAULT_THRESHOLD = 0.35;
/** A resize burst (window drag, pinch zoom) runs the visible-target pass once, this long after its last event. */
const RESIZE_DEBOUNCE_MS = 150;

/**
 * The home page's one reveal observer (identity §5.4 T1, §5.10): it marks every `[data-reveal]`
 * element `is-in` once its top is past this share of the viewport, counted up from the bottom edge
 * (`data-reveal="0.45"` sets another share). The trigger is a `rootMargin`, not a `threshold`: a
 * threshold is a share of the element's own area, which an element taller than innerHeight /
 * threshold (the host letter at 400 % zoom) never reaches. The class only matters under the motion
 * gate (motion.css); without motion every section is already in its final state. Put `data-reveal`
 * on an element whose className React never changes, or a re-render would drop the class. At load,
 * two frames after the observers start, every target whose top is already above the viewport's
 * bottom edge is revealed too, so a restored scroll position reveals what it passed. The fact strip
 * overlaps the hero, so it sits in the bottom 35 % of the first screen and would stay an empty card
 * until the first scroll. The same pass repeats on a debounced window or visualViewport resize.
 */
export default function HomeRevealObserver() {
  useEffect(() => {
    // First statement, on every path: tells the boot script's 4 s failsafe (layout.tsx) that this page hydrated.
    document.documentElement.setAttribute('data-reveal-ready', '');
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((target) => target.classList.add('is-in'));
      return undefined;
    }
    const observers = new Map<number, IntersectionObserver>();
    const owners = new Map<HTMLElement, IntersectionObserver>();
    for (const target of targets) {
      const parsed = Number.parseFloat(target.dataset.reveal ?? '');
      const threshold = parsed > 0 && parsed <= 1 ? parsed : DEFAULT_THRESHOLD;
      let observer = observers.get(threshold);
      if (!observer) {
        observer = new IntersectionObserver((entries, self) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-in');
            self.unobserve(entry.target);
          }
        }, { rootMargin: `0px 0px -${Math.round(threshold * 100)}% 0px` });
        observers.set(threshold, observer);
      }
      observer.observe(target);
      owners.set(target, observer);
    }
    // Reveals every target whose top is above the viewport's bottom edge, which the rootMargin trigger misses while a target sits in the bottom 35 %.
    const revealVisible = () => {
      for (const [target, observer] of owners) {
        if (target.classList.contains('is-in') || target.getBoundingClientRect().top >= window.innerHeight) continue;
        target.classList.add('is-in');
        observer.unobserve(target);
      }
    };
    // Two frames later: the first runs before the next paint, so only after the second has the hidden state certainly been painted and the M6/M8 transitions still play.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(revealVisible);
    });
    // A viewport that grows later (zoom out, DevTools closed, window maximised, rotation) fires no intersection report, so repeat the pass, debounced (R-685).
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(revealVisible, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  return null;
}
