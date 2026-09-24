import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { recordVital } from '@/lib/analyticsRepository';
import {
  createClientIdentityUnavailableResponse,
  isClientIdentityUnavailableError,
} from '@/lib/net/clientIdentity';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { ApiError, readJsonBody } from '@/lib/apiErrorHandler';

const vitalSchema = z.object({
  name: z.enum(['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB']),
  value: z.number().finite().min(0).max(1e9),
  id: z.string().max(100).optional(),
  path: z.string().max(2_048).optional(),
}).strict();

function safePath(value: string | null | undefined): string {
  if (!value) return '/';
  try {
    const pathname = new URL(value, 'https://vitals.invalid').pathname.replace(/\/{2,}/g, '/');
    return pathname.startsWith('/') && pathname.length <= 512 ? pathname : '/';
  } catch {
    return '/';
  }
}

export async function POST(request: NextRequest) {
  let decision: Awaited<ReturnType<typeof checkSensitiveRateLimit>>;
  try {
    decision = await checkSensitiveRateLimit(request, {
      scope: 'vitals-ingest',
      limit: 60,
      windowMs: 60_000,
    });
  } catch (error) {
    if (isClientIdentityUnavailableError(error)) {
      return createClientIdentityUnavailableResponse();
    }
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    throw error;
  }
  if (!decision.allowed) {
    return Response.json({ error: 'Rate limited' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, 16 * 1_024);
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    throw error;
  }
  const parsed = vitalSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Invalid vital payload' }, { status: 422 });
  await recordVital({
    name: parsed.data.name,
    value: parsed.data.value,
    id: parsed.data.id || crypto.randomUUID(),
    path: safePath(parsed.data.path || request.headers.get('referer')),
  });
  return Response.json({ recorded: true }, { status: 201 });
}
