import { notFound } from 'next/navigation';
import { getFeatureFlags } from '@/lib/featureFlags';

export const dynamic = 'force-dynamic';

export default function GuestSegmentLayout({ children }: { children: React.ReactNode }) {
  const flags = getFeatureFlags();
  if (!flags.portalEnabled) return notFound();
  return children;
}
