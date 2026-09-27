import type { Metadata } from 'next';

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The portal flag is checked by the segment's page: layouts are not re-rendered on client navigation.
export default function GuestSegmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
