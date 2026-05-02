import type { Metadata } from 'next';
import AdminSessionManager from '@/components/AdminSessionManager';
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
    <main className="min-h-screen" style={{ background: 'var(--sand-50)' }}>
      <AdminSessionManager />
      <AdminRequestsClient />
    </main>
  );
}
