import type { Metadata } from 'next';
import { requireAdminPageSession } from '@/lib/adminPageAuth';
import AdminAvailabilityClient from './AdminAvailabilityClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Availability & Prices',
  robots: 'noindex, nofollow',
};

export default async function AdminAvailabilityPage() {
  await requireAdminPageSession();
  return (
    <main>
      <AdminAvailabilityClient />
    </main>
  );
}
