"use client";

import { useEffect } from 'react';

/**
 * M14 pointer part (identity §5.5): on fine pointers the relief stage tilts toward the pointer by a few
 * degrees. It only writes --px/--py (−.5….5) on `.relief`; the motion gate in motion.css decides
 * whether they do anything, so without motion the plan stays flat.
 */
export default function ReliefTilt() {
  useEffect(() => {
    const relief = document.querySelector<HTMLElement>('#location .relief');
    const section = document.getElementById('location');
    if (!relief || !section || !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return undefined;

    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      relief.style.setProperty('--px', x.toFixed(3));
      relief.style.setProperty('--py', y.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      x = event.clientX / window.innerWidth - 0.5;
      y = event.clientY / window.innerHeight - 0.5;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    section.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      section.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
