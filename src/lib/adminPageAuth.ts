import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAdminSession } from '@/lib/auth/admin';

export async function requireAdminPageSession(): Promise<void> {
  const cookieStore = await cookies();
  const jwtCookie = cookieStore.get('admin_jwt');

  if (!jwtCookie?.value || !(await verifyAdminSession(jwtCookie.value))) {
    redirect('/admin/login?error=session_expired');
  }
}
