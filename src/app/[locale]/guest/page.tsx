import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { STAY_HUB_PATH } from '@/components/shell/shellLinks';
import { normalizeLocale } from '@/i18n/config';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import { GUEST_REFRESH_COOKIE, getVerifiedGuestSessionFromCookies } from '@/lib/guestSession';
import UnifiedGuestClient from './UnifiedGuestClient';

export const dynamic = 'force-dynamic';

type GuestUnifiedPageProps = {
  params?: Promise<{ locale?: string }>;
  searchParams?: Promise<{ mode?: string; flash?: string }>;
};

export default async function GuestUnifiedPage({ params, searchParams }: GuestUnifiedPageProps = {}) {
  const flags = await getFeatureFlagsAsync();
  if (!flags.portalEnabled) return notFound();

  const [resolvedParams, resolvedSearch] = await Promise.all([
    params ?? Promise.resolve(undefined),
    searchParams ?? Promise.resolve(undefined),
  ]);
  const eff = normalizeLocale(resolvedParams?.locale);

  if (resolvedSearch?.mode !== 'signup') {
    const target = flags.checkinEnabled ? `/${eff}/check-in` : `/${eff}${STAY_HUB_PATH}`;
    const session = await getVerifiedGuestSessionFromCookies();
    if (session) redirect(target);

    if (!resolvedSearch?.flash && (await cookies()).get(GUEST_REFRESH_COOKIE)?.value) {
      const next = encodeURIComponent(target);
      const failure = encodeURIComponent(`/${eff}/guest?flash=session_required`);
      redirect(`/${eff}/portal/refresh?next=${next}&failure=${failure}`);
    }
  }

  return <UnifiedGuestClient />;
}
