import type { Metadata } from 'next';
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
    <main>
      <AdminSettingsClient />
    </main>
  );
}
