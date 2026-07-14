import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { drainBookingOutbox } from '@/lib/bookingOutbox';

export const dynamic = 'force-dynamic';

function validCronSecret(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected || expected.length < 32 || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  if (!validCronSecret(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const result = await drainBookingOutbox();
  return NextResponse.json({ success: true, ...result }, { status: 200 });
}
