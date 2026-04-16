import { NextRequest } from 'next/server';
import { verifyAdmin } from '@/lib/auth/admin';

export type Role = 'admin' | 'guest';

export function isAdminRequest(req: NextRequest): boolean {
  // Require BOTH admin secret and valid admin_jwt cookie, per repo policy
  const secret = process.env.ADMIN_DASH_SECRET;
  const provided = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('token') || undefined;
  const jwt = req.cookies.get('admin_jwt')?.value;
  const hasValidJWT = jwt ? !!verifyAdmin(jwt) : false;
  return !!(secret && provided === secret && hasValidJWT);
}

export function requireSubjectOrAdmin(req: NextRequest, subjectUserId?: string, sessionUserId?: string): 'admin' | 'self' | null {
  if (isAdminRequest(req)) return 'admin';
  if (subjectUserId && sessionUserId && subjectUserId === sessionUserId) return 'self';
  return null;
}
