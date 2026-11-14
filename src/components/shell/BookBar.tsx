"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';

import { Button } from '@/components/ui/Button';

type BookBarProps = {
  /** "Free tonight" or "Next free night: …", only from a fresh calendar; null: there is no bar at all (identity §8). */
  note: string | null;
  href: string;
  ctaLabel: string;
};

/**
 * identity §8 BookBar (mobile, below lg; Home and Apartment only): a fixed glass pill with the free-night note
 * ("Free tonight", "Next free night: …") and "Check dates". It stays hidden until the hero or page head (`[data-hero]`) has left the view and while any in-page
 * booking call to action (`[data-cta-watch]`) is visible, both from IntersectionObserver. Hidden, it is
 * `inert` and `visibility: hidden` (shell.css), so it is out of the tab order and the accessibility tree.
 * Without a note (no fresh calendar, no free night), IntersectionObserver or JavaScript it never shows. The bar shows no price. M22 slides it in under motion.
 * It publishes its height as `--bookbar-h` (ResizeObserver; the text wraps at larger text sizes), which shell.css uses to
 * keep the network dot and the PWA pills beside and above it instead of under it (PS-07).
 */
export default function BookBar({ note, href, ctaLabel }: BookBarProps) {
  const [shown, setShown] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (note === null || typeof IntersectionObserver === 'undefined') return undefined;
    const hero = document.querySelector('[data-hero]');
    const watched = Array.from(document.querySelectorAll('[data-cta-watch]'));
    let heroInView = hero !== null;
    const ctasInView = new Set<Element>();

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) heroInView = entry.isIntersecting;
        else if (entry.isIntersecting) ctasInView.add(entry.target);
        else ctasInView.delete(entry.target);
      }
      setShown(!heroInView && ctasInView.size === 0);
    });
    if (hero) observer.observe(hero);
    watched.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [note]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return undefined;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--bookbar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--bookbar-h');
    };
  }, [note]);

  if (note === null) return null;

  return (
    <div ref={barRef} className={clsx('bookbar', shown && 'is-shown')} inert={!shown}>
      <p className="bookbar__text">{note}</p>
      <Button asChild variant="primary" size="sm">
        <Link href={href}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}
