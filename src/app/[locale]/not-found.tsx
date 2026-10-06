"use client";
import { usePathname } from 'next/navigation';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import { STAY_HUB_PATH } from '@/components/shell/shellLinks';
import { StatusLinks, StatusPage } from '@/components/stay/StatusPage';

// Rendered inside the locale layout for notFound() and unknown paths (identity §9.10).
export default function LocaleNotFound() {
  const pathname = usePathname();
  const locale: Locale = pathname?.startsWith('/el') ? 'el' : 'en';
  const t = getDictionary(locale);
  return (
    <StatusPage title={t.errors.notFoundTitle} lead={t.errors.notFoundBody}>
      <StatusLinks
        links={[
          { href: `/${locale}`, label: t.cta.home },
          { href: `/${locale}/moments`, label: t.shell.navGuide },
          { href: `/${locale}${STAY_HUB_PATH}`, label: t.ui.yourStay },
        ]}
      />
    </StatusPage>
  );
}
