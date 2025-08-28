// Deprecated: original QR SVG route relocated to /qr/image.
// Keeping this file temporarily returns 410 Gone to prevent route conflict once Next.js
// stops considering both page + route as conflicting when different content types. Remove soon.
import { NextResponse } from 'next/server';
export function GET() {
  // Redirect human visits to QR info page (keeps simple route for QR code image)
  return NextResponse.redirect(new URL('/qr-info', 'http://localhost')); // host replaced at runtime
}
