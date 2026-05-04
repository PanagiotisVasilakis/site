import { locales, type Locale } from '@/i18n/config';
import PortalRefreshRedirect from '@/components/PortalRefreshRedirect';

export const dynamic = 'force-dynamic';
export const metadata = {
  robots: { index: false, follow: false },
  title: 'Refreshing Session',
};

const isSafePath = (value?: string | null): value is string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

type PortalRefreshPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; failure?: string }>;
};

export default async function PortalRefreshPage({ params, searchParams }: PortalRefreshPageProps) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
  const search = await searchParams;
  const failureDefault = `/${eff}/guest?flash=${encodeURIComponent('Please sign in to access check-in information')}`;
  const nextPath = isSafePath(search.next) ? search.next : `/${eff}/check-in`;
  const failurePath = isSafePath(search.failure) ? search.failure : failureDefault;
  const refreshHref = `/api/portal/refresh?next=${encodeURIComponent(nextPath)}&failure=${encodeURIComponent(failurePath)}`;

  return <PortalRefreshRedirect refreshHref={refreshHref} failureHref={failurePath} />;
}
