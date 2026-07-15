import { locales, type Locale } from '@/i18n/config';
import PortalRefreshRedirect from '@/components/PortalRefreshRedirect';
import { toSafeLocalPath } from '@/lib/safeLocalPath';

export const dynamic = 'force-dynamic';
export const metadata = {
  robots: { index: false, follow: false },
  title: 'Refreshing Session',
};

type PortalRefreshPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; failure?: string }>;
};

export default async function PortalRefreshPage({ params, searchParams }: PortalRefreshPageProps) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
  const search = await searchParams;
  const failureDefault = `/${eff}/guest?flash=${encodeURIComponent('Please sign in to access check-in information')}`;
  const nextPath = toSafeLocalPath(search.next) ?? `/${eff}/check-in`;
  const failurePath = toSafeLocalPath(search.failure) ?? failureDefault;
  const refreshHref = `/api/portal/refresh?next=${encodeURIComponent(nextPath)}&failure=${encodeURIComponent(failurePath)}`;

  return <PortalRefreshRedirect refreshHref={refreshHref} failureHref={failurePath} />;
}
