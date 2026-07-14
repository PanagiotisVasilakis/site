import type { Metadata } from 'next';
import AdminSessionManager from '@/components/AdminSessionManager';
import { requireAdminPageSession } from '@/lib/adminPageAuth';
import AdminSettingsClient from './AdminSettingsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Settings',
  robots: 'noindex, nofollow',
};

export default async function AdminSettingsPage() {
  await requireAdminPageSession();
  return (
    <main className="admin-page-shell min-h-screen">
      <AdminSessionManager />
      <AdminSettingsClient />
    </main>
  );
}
