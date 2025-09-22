/**
 * OpenAPI 3.0 JSON endpoint
 */

import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { openApiSpec } from '@/lib/openapi';

// Generate OpenAPI JSON endpoint
export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}