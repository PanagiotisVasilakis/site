const NAME = 'gallery-photo';

/**
 * identity §5.7 "Gallery thumbnail → lightbox": runs `update` inside a View Transition in which `from` (before)
 * and `to()` (after) share one view-transition-name, so the photo morphs between them and the rest of the page
 * crossfades (motion.css, `html[data-vt="photo"]`). Without the API, or unless `data-motion="full"` (OS or
 * in-page reduce), `update` runs at once: the lightbox then fades in by CSS, or appears instantly.
 * `update` must commit synchronously (flushSync).
 */
export function morphPhoto(from: HTMLElement | null, to: () => HTMLElement | null, update: () => void): void {
  const root = document.documentElement;
  if (root.getAttribute('data-motion') !== 'full' || typeof document.startViewTransition !== 'function') {
    update();
    return;
  }
  let target: HTMLElement | null = null;
  if (from) from.style.viewTransitionName = NAME;
  root.setAttribute('data-vt', 'photo');
  const transition = document.startViewTransition(() => {
    if (from) from.style.viewTransitionName = '';
    update();
    target = from ? to() : null;
    if (target) target.style.viewTransitionName = NAME;
  });
  const clear = () => {
    if (target) target.style.viewTransitionName = '';
    root.removeAttribute('data-vt');
  };
  transition.finished.then(clear, clear);
}
