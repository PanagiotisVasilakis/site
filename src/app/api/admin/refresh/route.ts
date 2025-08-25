import { NextRequest } from 'next/server';
import { verifyAdmin, signAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const cookie = (req.headers.get('cookie') || '').split(';').map(c=>c.trim()).find(c=>c.startsWith('admin_jwt='))?.split('=')[1];
  if (!cookie) return new Response('unauthorized', { status: 401 });
  const payload = verifyAdmin(cookie);
  if (!payload) return new Response('unauthorized', { status: 401 });
  // Re-sign payload excluding std JWT claims
  const fresh = signAdmin(Object.fromEntries(Object.entries(payload).filter(([k]) => !['iat','exp'].includes(k))), '2h');
  const res = new Response('ok', { status: 200 });
  res.headers.append('Set-Cookie', `admin_jwt=${fresh}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`);
  return res;
}
