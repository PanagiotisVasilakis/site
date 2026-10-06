"use client";

import { useEffect } from 'react';

import { heroDepthSrc, heroGateFailure } from '@/lib/motion/heroCapability';
import { scheduleIdle } from '@/lib/motion/scheduleIdle';

import type { HeroGlHandle } from './heroGl';

/**
 * Loads the WebGL living photograph (identity §5.6, T2) after load and idle, only when the capability
 * gate passes. Renders nothing: the SSR photo is the hero until the canvas fades in over it.
 */
export default function HeroGlIsland() {
  useEffect(() => {
    let handle: HeroGlHandle | null = null;
    let stopped = false;
    const cancel = scheduleIdle(() => {
      const hero = document.querySelector<HTMLElement>('[data-hero]');
      const img = hero?.querySelector<HTMLImageElement>('.hero__img');
      if (!hero || !img) return;
      const failure = heroGateFailure(navigator as Navigator & { deviceMemory?: number }, document, hero);
      const depthSrc = heroDepthSrc(img.currentSrc);
      if (failure || !depthSrc) {
        hero.dataset.gl = `off:${failure ?? 'assets'}`;
        return;
      }
      import('./heroGl').then(
        ({ mountHeroGl }) => {
          if (!stopped) handle = mountHeroGl({ hero, img, depthSrc });
        },
        () => {
          hero.dataset.gl = 'off:script';
        },
      );
    });
    return () => {
      stopped = true;
      cancel();
      handle?.destroy();
    };
  }, []);

  return null;
}
