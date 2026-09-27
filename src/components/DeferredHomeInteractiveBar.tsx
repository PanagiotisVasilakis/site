"use client";

import { useEffect, useState, type ComponentType } from 'react';

interface Props {
  locale: string;
  subline?: string;
}

function defer(callback: () => void) {
  let timeoutId: number | null = null;
  const run = () => {
    timeoutId = window.setTimeout(callback, 1800);
  };

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });

  return () => {
    window.removeEventListener('load', run);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
}

export default function DeferredHomeInteractiveBar(props: Props) {
  const [Component, setComponent] = useState<ComponentType<Props> | null>(null);

  useEffect(() => {
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      void import('@/components/HomeInteractiveBar').then((module) => {
        setComponent(() => module.default);
      });
    };
    // A #book-now link needs the bar now; HomeInteractiveBar scrolls to it on mount.
    const loadForHash = () => {
      if (window.location.hash === '#book-now') load();
    };
    loadForHash();
    window.addEventListener('hashchange', loadForHash);
    const cancelDefer = defer(load);
    return () => {
      window.removeEventListener('hashchange', loadForHash);
      cancelDefer();
    };
  }, []);

  if (Component) return <Component {...props} />;

  return (
    <div
      id="home-booking-bar"
      className="-mt-6 mb-10 rounded-3xl shadow-[0_22px_48px_-26px_rgba(8,20,40,0.38)]"
      aria-hidden="true"
    >
      <div className="booking-bar min-h-[112px]" />
    </div>
  );
}
