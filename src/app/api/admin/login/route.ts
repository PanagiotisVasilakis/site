import { NextRequest } from 'next/server';
import { signAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_DASH_SECRET;
  if (!secret) return new Response('disabled', { status: 400 });
  try {
    const { token } = await req.json();
    if (token !== secret) return new Response('unauthorized', { status: 401 });
    const jwt = signAdmin({ role: 'admin' });
    const res = new Response('ok', { status: 200 });
    res.headers.append('Set-Cookie', `admin_jwt=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`);
    return res;
  } catch {
    return new Response('error', { status: 500 });
  }
}