import { NextRequest } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/admin';

export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const jwt = req.cookies.get('admin_jwt')?.value;
  const hasValidJWT = jwt ? !!(await verifyAdminSession(jwt)) : false;
  return hasValidJWT;
}

export async function requireSubjectOrAdmin(req: NextRequest, subjectUserId?: string, sessionUserId?: string): Promise<'admin' | 'self' | null> {
  if (await isAdminRequest(req)) return 'admin';
  if (subjectUserId && sessionUserId && subjectUserId === sessionUserId) return 'self';
  return null;
}
