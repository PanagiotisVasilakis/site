import { NextRequest } from 'next/server';
import { verifyAdmin, signAdmin } from '@/lib/auth';
import crypto from 'node:crypto';

export async function POST(req: NextRequest) {
  // Parse JWT token safely from cookie
  const cookieHeader = req.headers.get('cookie') || '';
  const jwt = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('admin_jwt='))
    ?.split('=', 2)[1]; // Use split with limit to handle JWT with = signs
    
  if (!jwt) return new Response('unauthorized', { status: 401 });
  
  const payload = verifyAdmin(jwt);
  if (!payload) return new Response('unauthorized', { status: 401 });
  
  // Validate that the token contains expected structure
  if (!payload.role || payload.role !== 'admin') {
    return new Response('unauthorized', { status: 401 });
  }
  
  // Check token age - don't allow refresh of very old tokens
  const tokenAge = Date.now() / 1000 - (payload.iat || 0);
  if (tokenAge > 86400) { // 24 hours max token age
    return new Response('unauthorized', { status: 401 });
  }
  
  // Generate new session with clean payload and unique JTI
  const cleanPayload = {
    role: 'admin', // Only preserve validated, expected claims
    jti: crypto.randomUUID(), // Unique token identifier
    refreshed_at: Math.floor(Date.now() / 1000)
  };
  
  const fresh = signAdmin(cleanPayload, '2h');
  const res = new Response('ok', { status: 200 });
  
  // Enhanced cookie security
  res.headers.append('Set-Cookie', 
    `admin_jwt=${fresh}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
  
  return res;
}
