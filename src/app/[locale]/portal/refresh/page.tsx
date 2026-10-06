import type { Metadata } from 'next';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import PortalRefreshRedirect from '@/components/PortalRefreshRedirect';
import { toSafeLocalPath } from '@/lib/safeLocalPath';

export const dynamic = 'force-dynamic';

type PortalRefreshPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; failure?: string }>;
};

export async function generateMetadata({ params }: Pick<PortalRefreshPageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  return {
    robots: { index: false, follow: false },
    title: getDictionary(normalizeLocale(locale)).stay.refresh.title,
  };
}

export default async function PortalRefreshPage({ params, searchParams }: PortalRefreshPageProps) {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const search = await searchParams;
  const failureDefault = `/${eff}/guest?flash=session_required`;
  const nextPath = toSafeLocalPath(search.next) ?? `/${eff}/check-in`;
  const failurePath = toSafeLocalPath(search.failure) ?? failureDefault;
  const refreshHref = `/api/portal/refresh?next=${encodeURIComponent(nextPath)}`;

  return <PortalRefreshRedirect locale={eff} refreshHref={refreshHref} failureHref={failurePath} />;
}
