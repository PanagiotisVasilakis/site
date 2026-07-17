/**
 * CSP Violation Report Endpoint
 * Handles Content Security Policy violation reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleCSPViolation } from '@/lib/security-monitoring';
import { getClientIp } from '@/lib/net/getClientIp';
import {
  createClientIdentityUnavailableResponse,
  isClientIdentityUnavailableError,
} from '@/lib/net/clientIdentity';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { ApiError, readJsonBody } from '@/lib/apiErrorHandler';

const MAX_REPORT_BYTES = 16 * 1_024;
const cspReportSchema = z.object({
  'document-uri': z.string().max(2_000).optional(),
  'violated-directive': z.string().max(500).optional(),
  'effective-directive': z.string().max(500).optional(),
  'blocked-uri': z.string().max(2_000).optional(),
  'original-policy': z.string().max(8_000).optional(),
  'source-file': z.string().max(2_000).optional(),
  'line-number': z.number().int().nonnegative().optional(),
  'column-number': z.number().int().nonnegative().optional(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_REPORT_BYTES) {
      return NextResponse.json({ error: 'Report too large' }, { status: 413 });
    }
    const decision = await checkSensitiveRateLimit(request, {
      scope: 'csp-report', limit: 30, windowMs: 60_000,
    });
    if (!decision.allowed) return NextResponse.json({ error: 'Too many reports' }, { status: 429 });

    const raw = await readJsonBody(
      request,
      MAX_REPORT_BYTES,
      ['application/csp-report', 'application/json'],
    );
    const candidate = typeof raw === 'object' && raw !== null && 'csp-report' in raw
      ? (raw as { 'csp-report': unknown })['csp-report']
      : raw;
    const parsed = cspReportSchema.safeParse(candidate);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid CSP report' }, { status: 400 });

    const clientInfo = {
      ip: getClientIp(request),
    };

    await handleCSPViolation(parsed.data, clientInfo);

    // Return success response
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isClientIdentityUnavailableError(error)) {
      return createClientIdentityUnavailableResponse();
    }
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Invalid CSP report' }, { status: 400 });
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
