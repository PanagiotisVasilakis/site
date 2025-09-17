import { NextRequest } from 'next/server';
import { signAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import crypto from 'node:crypto';

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_DASH_SECRET;
  if (!secret) return new Response('disabled', { status: 400 });
  try {
    const { token } = await req.json();
    if (token !== secret) return new Response('unauthorized', { status: 401 });
    
    // Generate JWT with unique identifier and clean payload
    const jwt = signAdmin({ 
      role: 'admin',
      jti: crypto.randomUUID(), // Unique token identifier
      login_at: Math.floor(Date.now() / 1000)
    });
    
    const res = new Response('ok', { status: 200 });
    
    // Enhanced cookie security with consistent settings
    res.headers.append('Set-Cookie', 
      `admin_jwt=${jwt}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`
    );
    
    return res;
  } catch (error) {
    logger.error('Admin login failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/admin/login'
    });
    return new Response('internal_server_error', { status: 500 });
  }
}