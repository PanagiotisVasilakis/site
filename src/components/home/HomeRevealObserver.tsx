"use client";

import { useEffect } from 'react';

/** M6, M8, M10, M12 and M17 reveal when this share of the element is in view (§5.5). */
const DEFAULT_THRESHOLD = 0.35;

/**
 * The home page's one reveal observer (identity §5.4 T1, §5.10): it marks every `[data-reveal]`
 * element `is-in` once it is in view (`data-reveal="0.45"` sets another threshold). The class only
 * matters under the motion gate (motion.css); without motion every section is already in its final
 * state. Put `data-reveal` on an element whose className React never changes, or a re-render would
 * drop the class.
 */
export default function HomeRevealObserver() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((target) => target.classList.add('is-in'));
      return undefined;
    }
    const observers = new Map<number, IntersectionObserver>();
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
        }, { threshold });
        observers.set(threshold, observer);
      }
      observer.observe(target);
    }
    return () => observers.forEach((observer) => observer.disconnect());
  }, []);

  return null;
}
