import type { Metadata } from 'next';
import { requireAdminPageSession } from '@/lib/adminPageAuth';
import AdminRequestsClient from './AdminRequestsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Requests | Arrival Times',
  description: 'Manage guest arrival-time requests',
  robots: 'noindex, nofollow',
};

export default async function AdminRequestsPage() {
  await requireAdminPageSession();

  return (
    <main>
      <AdminRequestsClient />
    </main>
  );
}
