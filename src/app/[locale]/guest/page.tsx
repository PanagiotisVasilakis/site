import { notFound } from 'next/navigation';
import { getFeatureFlags } from '@/lib/featureFlags';
import UnifiedGuestClient from './UnifiedGuestClient';
import { locales, type Locale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

export default function GuestUnifiedPage({ params }: { params: { locale: string } }) {
  const flags = getFeatureFlags();
  if (!flags.portalEnabled) return notFound();
  const eff = (locales as readonly string[]).includes(params.locale) ? (params.locale as Locale) : 'en';
  // Render the client component; i18n is handled inside via useParams
  return <UnifiedGuestClient key={eff} />;
}
