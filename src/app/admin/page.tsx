import type { Metadata } from 'next';
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
    <main>
      <AdminHomeClient />
    </main>
  );
}
