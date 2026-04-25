"use client";

import { useEffect, useRef, useState, type ComponentType } from 'react';

interface Props {
  locale: string;
}

export default function DeferredContactSection(props: Props) {
  const [Component, setComponent] = useState<ComponentType<Props> | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

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

    if ('IntersectionObserver' in window && ref.current) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          load();
        }
      }, { rootMargin: '300px 0px' });
      observer.observe(ref.current);
    }

    timeoutId = window.setTimeout(load, 3500);

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [Component]);

  if (Component) return <Component {...props} />;
  return <div ref={ref} className="min-h-[280px]" aria-hidden="true" />;
}
