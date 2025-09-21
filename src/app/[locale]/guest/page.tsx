import { notFound } from 'next/navigation';
import { getFeatureFlags } from '@/lib/featureFlags';
import UnifiedGuestClient from './UnifiedGuestClient';
import { locales, type Locale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

export default async function GuestUnifiedPage({ params }: { params: Promise<{ locale: string }> }) {
  const flags = getFeatureFlags();
  if (!flags.portalEnabled) return notFound();
  const p = await params;
  const eff = (locales as readonly string[]).includes(p.locale) ? (p.locale as Locale) : 'en';
  // Render the client component; i18n is handled inside via useParams
  return <UnifiedGuestClient key={eff} />;
}
