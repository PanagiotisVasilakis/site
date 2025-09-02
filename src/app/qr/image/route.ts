import QRCode from 'qrcode';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale } from '@/i18n/config';
import { config } from '@/lib/config';

export async function GET(req: NextRequest) {
  const absolute = config.absoluteSiteUrl();
  const cookieLocale = req.cookies.get('lang')?.value;
  const locale = cookieLocale && (locales as readonly string[]).includes(cookieLocale) ? cookieLocale : defaultLocale;
  const target = `${absolute}/${locale}`;
  const svg = await QRCode.toString(target, { type: 'svg', margin: 1, width: 512 });
  return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
}
