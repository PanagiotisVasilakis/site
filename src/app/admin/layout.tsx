import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import AdminSessionManager from '@/components/AdminSessionManager';
import { readActiveAdminSession } from '@/lib/auth/admin';

// One session manager for every admin page. The layout persists across client
// navigations, so the refresh schedule is not restarted per page. Pages keep
// their own requireAdminPageSession check because layouts do not re-run on
// client navigation.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get('admin_jwt')?.value;
  const session = token ? await readActiveAdminSession(token) : null;
  const expiresAt = session ? session.expiresAt.toISOString() : null;
  return (
    <>
      <AdminSessionManager key={expiresAt ?? 'signed-out'} expiresAt={expiresAt} />
      {children}
    </>
  );
}
