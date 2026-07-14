import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({
    success: false,
    error: {
      code: 'CLAIM_GRANT_REQUIRED',
      message: 'Legacy onsite confirmation was removed. Use a one-time host-issued claim token.',
    },
  }, { status: 410 });
}
