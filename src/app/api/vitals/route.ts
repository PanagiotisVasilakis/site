import { addVital, vitalsSummary } from '@/lib/analyticsStore';
import { logger } from '@/lib/logger';
import crypto from 'node:crypto';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // Enhanced validation for security
    if (!data || typeof data !== 'object') {
      return new Response('bad_request', { status: 400 });
    }
    
    const { name, value, id } = data;
    
    // Validate required fields with proper types
    if (typeof name !== 'string' || typeof value !== 'number') {
      return new Response('bad_request', { status: 400 });
    }
    
    // Validate string length to prevent abuse
    if (name.length > 100 || (id && typeof id === 'string' && id.length > 100)) {
      return new Response('bad_request', { status: 400 });
    }
    
    // Validate value range
    if (!Number.isFinite(value) || value < 0 || value > 1e9) {
      return new Response('bad_request', { status: 400 });
    }
    
    // Validate allowed metric names (whitelist approach)
    const allowedMetrics = ['CLS', 'FID', 'LCP', 'INP', 'TTFB', 'FCP'];
    if (!allowedMetrics.includes(name)) {
      return new Response('bad_request', { status: 400 });
    }
    
    addVital({ 
      name, 
      value, 
      id: (id && typeof id === 'string') ? id : crypto.randomUUID(), 
      ts: Date.now() 
    });
    
    return new Response('ok', { status: 201 });
  } catch (error) { 
    logger.error('Vitals POST failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/vitals'
    });
    return new Response('internal_server_error', { status: 500 }); 
  }
}

export async function GET() {
  return Response.json({ vitals: vitalsSummary() });
}
