import { notFound } from 'next/navigation';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import UnifiedGuestClient from './UnifiedGuestClient';

export const dynamic = 'force-dynamic';

export default async function GuestUnifiedPage() {
  const flags = await getFeatureFlagsAsync();
  if (!flags.portalEnabled) return notFound();
  return <UnifiedGuestClient />;
}
