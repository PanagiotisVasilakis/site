import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Backwards-compatible public liveness endpoint.
 * Dependency and runtime diagnostics deliberately live behind readiness or
 * authenticated administrative routes.
 */
export function GET() {
  return NextResponse.json(
    { status: 'alive' },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}

export function HEAD() {
  return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
}
