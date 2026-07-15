import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { requireAdminPageSession } from '@/lib/adminPageAuth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Admin Guests',
  robots: 'noindex, nofollow',
};

export default async function AdminGuestsLayout({ children }: { children: ReactNode }) {
  await requireAdminPageSession();
  return children;
}
