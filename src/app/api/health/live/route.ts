import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { status: 'alive', timestamp: new Date().toISOString() },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}

export function HEAD() {
  return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
}
