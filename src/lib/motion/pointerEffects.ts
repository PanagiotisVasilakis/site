// Mounts the R3-V14 pointer effects (pointerEffectsRuntime.ts: M27 tilt + glare, M30 magnetic primary
// buttons) on fine-pointer devices only. The runtime is its own chunk (script-src 'self'), so phones and
// tablets never download it (identity §5.10).
import { useEffect } from 'react';

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/** Mounts the pointer effects while `enabled` (the site header passes false on calm stay routes, §5.1). */
export function usePointerEffects(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !window.matchMedia?.(FINE_POINTER).matches) return undefined;
    let detach: (() => void) | null = null;
    let unmounted = false;
    import('./pointerEffectsRuntime').then(
      ({ attachPointerEffects }) => {
        if (!unmounted) detach = attachPointerEffects(document);
      },
      () => {
        // An enhancement only: without its chunk (offline, failed fetch) the page stays still.
      },
    );
    return () => {
      unmounted = true;
      detach?.();
    };
  }, [enabled]);
}
