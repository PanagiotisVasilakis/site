"use client";

import { useEffect } from 'react';

import { isMotionFull } from '@/lib/motion/motionPreference';

/** M34 counters run as long as the M6 louvres open (§5.3 --dur-reveal). */
const COUNT_MS = 850;
/** The same share of the viewport as the louvres (HomeRevealObserver's default). */
const THRESHOLD = 0.35;

type Counter = { node: Text; value: number; final: string };

/**
 * R3-V14 (identity §5.5 M34): the fact strip's numbers count up once, as the strip opens. The server
 * markup holds the final numbers, and this island only rewrites their text while it counts, ending on
 * the exact server text, so without JavaScript or without `data-motion="full"` nothing changes. Only
 * a plain number counts ("90", "4"): an ordinal ("2nd", "2ος") stays as rendered, because its suffix
 * belongs to the final digit ("0nd" is not a word); the road sign (P) is not a number.
 */
export default function FactCounters() {
  useEffect(() => {
    const strip = document.querySelector<HTMLElement>('.facts');
    if (!strip || !isMotionFull() || typeof IntersectionObserver === 'undefined') return undefined;

    const counters: Counter[] = Array.from(strip.querySelectorAll('.fact__num:not(.fact__num--sign)')).flatMap((element) => {
      const node = element.firstChild;
      return node instanceof Text && /^\d+$/u.test(node.data) ? [{ node, value: Number(node.data), final: node.data }] : [];
    });
    let frame = 0;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      let start = 0;
      const step = (now: number) => {
        if (!start) start = now;
        const progress = Math.min(1, (now - start) / COUNT_MS);
        const eased = 1 - (1 - progress) ** 3;
        for (const counter of counters) {
          counter.node.data = progress < 1 ? `${Math.round(counter.value * eased)}` : counter.final;
        }
        frame = progress < 1 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    }, { rootMargin: `0px 0px -${Math.round(THRESHOLD * 100)}% 0px` });
    observer.observe(strip);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const counter of counters) counter.node.data = counter.final;
    };
  }, []);

  return null;
}
