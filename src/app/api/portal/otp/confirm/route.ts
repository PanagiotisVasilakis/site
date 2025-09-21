import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const dynamic = 'force-dynamic';

// Legacy confirm endpoint has been removed in favor of direct verification.
// Keep a stub to avoid broken imports and return a clear deprecation status.
export const POST = withErrorHandler(async () => {
  return new NextResponse(null, { status: 410, statusText: 'Gone' });
});
