import { NextRequest } from 'next/server';
import { z } from 'zod';
import { addVital, vitalsSummary } from '@/lib/analyticsStore';
import { withErrorHandler, validateRequestBody, createSuccessResponse } from '@/lib/apiErrorHandler';
import crypto from 'node:crypto';

// Zod schema for web vitals
const vitalSchema = z.object({
  name: z.enum(['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB']),
  value: z.number().finite().min(0).max(1e9),
  id: z.string().max(100).optional(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  delta: z.number().optional(),
  navigationType: z.enum(['navigate', 'reload', 'back-forward', 'prerender']).optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const data = await validateRequestBody(vitalSchema)(req);
  const { name, value, id } = data;
    
  addVital({ 
    name, 
    value, 
    id: id || crypto.randomUUID(), 
    ts: Date.now() 
  });
  
  return createSuccessResponse({ message: 'Vital recorded' }, 201);
});

export async function GET() {
  return Response.json({ vitals: vitalsSummary() });
}
