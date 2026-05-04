import type { Metadata } from 'next';
import AdminSessionManager from '@/components/AdminSessionManager';
import { requireAdminPageSession } from '@/lib/adminPageAuth';
import AdminHomeClient from './AdminHomeClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin | Operations',
  description: 'Operational admin dashboard',
  robots: 'noindex, nofollow',
};

export default async function AdminPage() {
  await requireAdminPageSession();

  return (
    <main className="admin-page-shell min-h-screen">
      <AdminSessionManager />
      <AdminHomeClient />
    </main>
  );
}
