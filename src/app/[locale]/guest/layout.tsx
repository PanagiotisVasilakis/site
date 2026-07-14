import { notFound } from 'next/navigation';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';

export const dynamic = 'force-dynamic';

export default async function GuestSegmentLayout({ children }: { children: React.ReactNode }) {
  const flags = await getFeatureFlagsAsync();
  if (!flags.portalEnabled) return notFound();
  return children;
}
