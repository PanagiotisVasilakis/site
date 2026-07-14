import { NextRequest, NextResponse } from 'next/server';

import { POST as createSession } from '@/app/api/portal/sessions/route';
import { ApiError, readJsonBody } from '@/lib/apiErrorHandler';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<Record<string, string>> }) {
  let body: ({ mode?: unknown } & Record<string, unknown>) | null;
  try {
    body = await readJsonBody(request.clone(), 16 * 1_024) as ({ mode?: unknown } & Record<string, unknown>) | null;
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    throw error;
  }
  if (body?.mode !== 'signin') {
    return NextResponse.json({
      success: false,
      error: {
        code: 'CLAIM_GRANT_REQUIRED',
        message: 'Public reservation lookup signup was removed. Use a host-issued claim token.',
      },
    }, { status: 410 });
  }

  const forwarded = new NextRequest(request.url.replace('/verify', '/sessions'), {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({
      phone: body && 'phone' in body ? body.phone : undefined,
      password: body && 'password' in body ? body.password : undefined,
      remember: body && 'remember' in body ? body.remember : undefined,
    }),
  });
  return createSession(forwarded, context);
}
