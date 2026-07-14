import { headers } from 'next/headers';
import AdminLoginClient from './AdminLoginClient';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  // Reading request headers opts the route into dynamic rendering, which is
  // required for Next.js to apply the per-request CSP nonce to bootstrap scripts.
  await headers();
  return <AdminLoginClient />;
}
