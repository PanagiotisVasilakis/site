import type { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import AdminSessionManager from '@/components/AdminSessionManager';
import { BrandMark } from '@/components/icons/BrandMark';
import { readActiveAdminSession } from '@/lib/auth/admin';

// One session manager for every admin page. The layout persists across client
// navigations, so the refresh schedule is not restarted per page. Pages keep
// their own requireAdminPageSession check because layouts do not re-run on
// client navigation.
//
// identity §9.12: admin pages get the minimal stay-style header (brand + "Admin"),
// not the marketing shell, on a plain token background without the public grain
// (`.admin-shell`, src/styles/components/admin.css).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get('admin_jwt')?.value;
  const session = token ? await readActiveAdminSession(token) : null;
  const expiresAt = session ? session.expiresAt.toISOString() : null;
  return (
    <div className="admin-shell">
      <AdminSessionManager key={expiresAt ?? 'signed-out'} expiresAt={expiresAt} />
      <header className="admin-header">
        <Link href="/admin" className="site-brand shell-link">
          <BrandMark className="site-brand__mark" />
          <span className="site-brand__text">
            {/* The wordmark (identity §1.2), as in SiteHeader. */}
            <span className="site-brand__name">Dolce Far Niente</span>
            <span className="site-brand__place">Admin</span>
          </span>
        </Link>
      </header>
      {children}
    </div>
  );
}
