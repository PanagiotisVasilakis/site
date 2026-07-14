import { notFound } from 'next/navigation';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import type { Metadata } from 'next';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export const dynamic = 'force-dynamic';

export default async function GuestSegmentLayout({ children }: { children: React.ReactNode }) {
  const flags = await getFeatureFlagsAsync();
  if (!flags.portalEnabled) return notFound();
  return children;
}
