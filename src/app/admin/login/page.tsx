import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { verifyAdminSession } from '@/lib/auth/admin';
import AdminLoginClient from './AdminLoginClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Admin Login',
  robots: 'noindex, nofollow',
};

export default async function AdminLoginPage() {
  // Reading request headers opts the route into dynamic rendering, which is
  // required for Next.js to apply the per-request CSP nonce to bootstrap scripts.
  await headers();
  const token = (await cookies()).get('admin_jwt')?.value;
  if (token && await verifyAdminSession(token)) {
    redirect('/admin');
  }
  return <AdminLoginClient />;
}
