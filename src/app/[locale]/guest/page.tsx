import { notFound } from 'next/navigation';
import { getFeatureFlags } from '@/lib/featureFlags';
import UnifiedGuestClient from './UnifiedGuestClient';
import { locales } from '@/i18n/config';

export const dynamic = 'force-dynamic';

export default async function GuestUnifiedPage({ params }: { params: Promise<{ locale: string }> }) {
  const flags = getFeatureFlags();
  if (!flags.portalEnabled) return notFound();
  const p = await params;
  // Validate locale but don't store it since component handles locale via useParams
  if (!(locales as readonly string[]).includes(p.locale)) {
    // Could redirect to default locale, but let the component handle it
  }
  // Render the client component; i18n is handled inside via useParams
  // Note: No key prop to preserve component state during locale changes
  return <UnifiedGuestClient />;
}
