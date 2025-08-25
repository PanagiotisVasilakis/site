import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/site';

export const revalidate = 3600;

export function GET() {
  const body = `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=3600' } });
}
