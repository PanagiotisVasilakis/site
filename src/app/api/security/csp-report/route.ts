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
import { logger } from '@/lib/logger-enterprise';

const MAX_REPORT_BYTES = 16 * 1_024;
// Browsers always add `referrer`, `disposition` and `status-code` to report-uri
// bodies (and `script-sample` with 'report-sample'), so the schema bounds them
// instead of rejecting the report. Other unknown keys are stripped, never stored.
// `original-policy` is bounded as well but not stored: it repeats the one static policy.
const cspReportSchema = z.object({
  'document-uri': z.string().max(2_000).optional(),
  referrer: z.string().max(2_000).optional(),
  'violated-directive': z.string().max(500).optional(),
  'effective-directive': z.string().max(500).optional(),
  'blocked-uri': z.string().max(2_000).optional(),
  'original-policy': z.string().max(8_000).optional(),
  disposition: z.enum(['enforce', 'report']).optional(),
  'status-code': z.number().int().nonnegative().max(999).optional(),
  'script-sample': z.string().max(256).optional(),
  'source-file': z.string().max(2_000).optional(),
  'line-number': z.number().int().nonnegative().optional(),
  'column-number': z.number().int().nonnegative().optional(),
});

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
    // A report that names no directive carries nothing to act on. It is answered like an
    // accepted one, so that no browser retries it, but it is neither stored nor counted.
    if (!parsed.data['violated-directive'] && !parsed.data['effective-directive']) {
      return new NextResponse(null, { status: 204 });
    }

    // The limit above is per client address. This one is shared by all clients and counts
    // only reports that store a row, so malformed ones cannot use up the budget and many
    // attested addresses together cannot grow the audit table unbounded.
    const globalDecision = await checkSensitiveRateLimit(request, {
      scope: 'csp-report-global', identifier: 'global', limit: 100, windowMs: 3_600_000,
    });
    if (!globalDecision.allowed) return NextResponse.json({ error: 'Too many reports' }, { status: 429 });

    const clientInfo = {
      ip: getClientIp(request),
    };

    await handleCSPViolation(parsed.data, clientInfo);

    // Return success response
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isClientIdentityUnavailableError(error)) {
      return createClientIdentityUnavailableResponse(error);
    }
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error('CSP report handling failed', error instanceof Error ? error : { error: String(error) });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
