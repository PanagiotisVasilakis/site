import Link from 'next/link';
import { locales, type Locale } from '@/i18n/config';
import { notFound } from 'next/navigation';
import { getFeatureFlags } from '@/lib/featureFlags';
import VerifyOpened from '@/components/analytics/VerifyOpened';
import VerifyActions from '@/components/analytics/VerifyActions';
export const dynamic = 'force-dynamic';

// Minimal skeleton page for /guest/verify (legacy)
export default async function GuestVerify({ params }: { params: Promise<{ locale: string }> }) {
  const flags = getFeatureFlags();
  if (!flags.portalEnabled) return notFound();
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en';

  return (
    <div className="page-container mx-auto max-w-md">
    <VerifyOpened />
    <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--fg-default)' }}>Verification not required</h1>
    <p className="text-[color:var(--fg-muted)] mb-6">This step is no longer used. Continue to check-in.</p>
    <VerifyActions />
    </div>
  );
}
