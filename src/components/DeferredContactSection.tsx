"use client";

import { useEffect, useRef, useState, type ComponentType } from 'react';

interface Props {
  locale: string;
}

const CONTACT_HASH = '#contact';

export default function DeferredContactSection(props: Props) {
  const [Component, setComponent] = useState<ComponentType<Props> | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  // Set when a #contact link asked for the section before it was loaded.
  const scrollWhenLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;
    let observer: IntersectionObserver | null = null;

    const load = () => {
      if (cancelled || Component) return;
      void import('@/components/ContactSection').then((module) => {
        if (!cancelled) setComponent(() => module.default);
      });
    };
    const loadForHash = () => {
      if (window.location.hash !== CONTACT_HASH) return;
      scrollWhenLoaded.current = true;
      load();
    };

    if ('IntersectionObserver' in window && ref.current) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          load();
        }
      }, { rootMargin: '300px 0px' });
      observer.observe(ref.current);
    }

    loadForHash();
    window.addEventListener('hashchange', loadForHash);
    timeoutId = window.setTimeout(load, 3500);

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener('hashchange', loadForHash);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [Component]);

  useEffect(() => {
    if (!Component || !scrollWhenLoaded.current) return;
    scrollWhenLoaded.current = false;
    document.getElementById('contact')?.scrollIntoView({ block: 'start' });
  }, [Component]);

  if (Component) return <Component {...props} />;
  // Carries the anchor until the section loads, so #contact links land here.
  return <div ref={ref} id="contact" className="min-h-[280px]" aria-hidden="true" />;
}
