import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function databaseReady(): Promise<boolean> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Database readiness timeout')), 2000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const ready = await databaseReady();
  return NextResponse.json(
    { status: ready ? 'ready' : 'not_ready', dependencies: { database: ready } },
    { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}

export async function HEAD() {
  const ready = await databaseReady();
  return new Response(null, { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
