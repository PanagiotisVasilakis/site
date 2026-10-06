"use client";

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { Segmented, segmentedItemClass } from '@/components/ui/Segmented';
import { localeSwitchHref } from './shellLinks';

/**
 * identity §8 LanguageSwitch: a Segmented of links to the same page in each locale (query and hash kept).
 * The proxy sets the `lang` cookie from the locale in the path, as before (src/proxy.ts). The Greek label
 * is written "ΕΛ" by hand (§2.6).
 */
const LOCALE_LINKS = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'el', short: 'ΕΛ', name: 'Ελληνικά' },
] as const;

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

function LocaleLinks({ locale, search }: { locale: string; search: string }) {
  const pathname = usePathname() || `/${locale}`;
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
  return LOCALE_LINKS.map(({ code, short, name }) => (
    <Link
      key={code}
      href={localeSwitchHref(pathname, code, search, hash)}
      hrefLang={code}
      lang={code}
      aria-label={name}
      aria-current={code === locale ? 'true' : undefined}
      className={clsx(segmentedItemClass, 'shell-link')}
    >
      {short}
    </Link>
  ));
}

function LocaleLinksWithQuery({ locale }: { locale: string }) {
  const search = useSearchParams()?.toString() ?? '';
  return <LocaleLinks locale={locale} search={search} />;
}

export default function LanguageSwitch({ locale, label, className }: { locale: string; label: string; className?: string }) {
  return (
    <Segmented label={label} className={className}>
      {/* useSearchParams needs a Suspense boundary on static routes; the fallback links carry no query. */}
      <Suspense fallback={<LocaleLinks locale={locale} search="" />}>
        <LocaleLinksWithQuery locale={locale} />
      </Suspense>
    </Segmented>
  );
}
