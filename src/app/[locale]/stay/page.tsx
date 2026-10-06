import type { Metadata } from 'next';
import { StayHub } from '@/components/stay/StayHub';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';

// The portal tile follows the feature flag (a database setting), so the hub renders per request.
export const dynamic = 'force-dynamic';

type StayPageProps = { params: Promise<{ locale: string }> };

// The hub is for guests in the apartment (QR code, "Your stay" links): not indexed and not in the sitemap.
export async function generateMetadata({ params }: StayPageProps): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: getDictionary(normalizeLocale(locale)).ui.yourStay,
    robots: { index: false, follow: false },
  };
}

export default async function StayPage({ params }: StayPageProps) {
  const { locale } = await params;
  const flags = await getFeatureFlagsAsync();
  return <StayHub locale={normalizeLocale(locale)} portalEnabled={flags.portalEnabled} checkinEnabled={flags.checkinEnabled} />;
}
