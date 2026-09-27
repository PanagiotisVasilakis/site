import { NextRequest } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/admin';

export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const jwt = req.cookies.get('admin_jwt')?.value;
  const hasValidJWT = jwt ? !!(await verifyAdminSession(jwt)) : false;
  return hasValidJWT;
}
