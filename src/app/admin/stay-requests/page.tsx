import type { Metadata } from 'next';
import AdminSessionManager from '@/components/AdminSessionManager';
import { requireAdminPageSession } from '@/lib/adminPageAuth';
import AdminStayRequestsClient from './AdminStayRequestsClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin Stay Requests', robots: 'noindex, nofollow' };

export default async function AdminStayRequestsPage() {
  await requireAdminPageSession();
  return <main className="admin-page-shell min-h-screen"><AdminSessionManager /><AdminStayRequestsClient /></main>;
}
