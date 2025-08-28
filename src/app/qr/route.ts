// Deprecated: original QR SVG route relocated to /qr/image.
// Keeping this file temporarily returns 410 Gone to prevent route conflict once Next.js
// stops considering both page + route as conflicting when different content types. Remove soon.
import { NextResponse } from 'next/server';
export async function GET() {
  return new NextResponse('Moved: use /qr/image', { status: 410 });
}
