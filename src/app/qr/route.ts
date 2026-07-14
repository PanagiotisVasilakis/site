// Deprecated: original QR SVG route relocated to /qr/image.
// Keep a human-friendly redirect at /qr without hardcoding host or port.
import { NextResponse } from 'next/server';

export function GET(request: Request) {
  // Redirect human visits to QR info page (keeps simple route for QR code image)
  return NextResponse.redirect(new URL('/qr-info', request.url), 307);
}
