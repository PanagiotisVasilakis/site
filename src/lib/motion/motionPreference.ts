// Keeps `data-motion` on <html> in sync after the boot script (docs/design/identity.md §5.2):
// stored `motion = 'reduce'` wins; otherwise motion is armed ("full") only while the OS has no
// reduced-motion preference. Mounted once by the site header; MotionSwitch calls
// applyMotionPreference after it stores or removes the choice.
import { useEffect } from 'react';

export const MOTION_KEY = 'motion';

export function applyMotionPreference() {
  const root = document.documentElement;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(MOTION_KEY);
  } catch {
    // Blocked storage behaves like no stored choice, as in the boot script.
  }
  if (stored === 'reduce') {
    root.setAttribute('data-motion', 'reduce');
  } else if (window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches) {
    root.setAttribute('data-motion', 'full');
  } else {
    root.removeAttribute('data-motion');
  }
}

/** True while motion is armed (§5.2): JS-driven motion checks this flag, as the CSS gate does. */
export function isMotionFull(): boolean {
  return document.documentElement.dataset.motion === 'full';
}

export function useMotionPreference() {
  useEffect(() => {
    applyMotionPreference();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOTION_KEY || event.key === null) applyMotionPreference();
    };
    reduce?.addEventListener('change', applyMotionPreference);
    window.addEventListener('storage', onStorage);
    return () => {
      reduce?.removeEventListener('change', applyMotionPreference);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
}
