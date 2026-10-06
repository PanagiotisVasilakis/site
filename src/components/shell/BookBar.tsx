"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';

import { Button } from '@/components/ui/Button';

type BookBarProps = {
  /** The "from {price} / night" template; `{price}` is replaced by the formatted price. */
  fromText: string;
  /** The formatted lowest nightly price, or null: then there is no bar at all (identity §8). */
  price: string | null;
  /** "Free tonight" or "Next free night: …", only from a fresh calendar. */
  note: string | null;
  href: string;
  ctaLabel: string;
};

/**
 * identity §8 BookBar (mobile, below lg; Home and Apartment only): a fixed glass pill with the price and
 * "Check dates". It stays hidden until the hero or page head (`[data-hero]`) has left the view and while any in-page
 * booking call to action (`[data-cta-watch]`) is visible, both from IntersectionObserver. Hidden, it is
 * `inert` and `visibility: hidden` (shell.css), so it is out of the tab order and the accessibility tree.
 * Without IntersectionObserver or JavaScript it never shows. M22 slides it in under motion.
 */
export default function BookBar({ fromText, price, note, href, ctaLabel }: BookBarProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (price === null || typeof IntersectionObserver === 'undefined') return undefined;
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
  }, [price]);

  if (price === null) return null;
  const [before, after = ''] = fromText.split('{price}');

  return (
    <div className={clsx('bookbar', shown && 'is-shown')} inert={!shown}>
      <p className="bookbar__text">
        <span className="bookbar__price">
          {before}
          <strong className="bookbar__value">{price}</strong>
          {after}
        </span>
        {note ? <span className="bookbar__note">{note}</span> : null}
      </p>
      <Button asChild variant="primary" size="sm">
        <Link href={href}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}
