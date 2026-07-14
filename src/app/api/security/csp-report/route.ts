/**
 * CSP Violation Report Endpoint
 * Handles Content Security Policy violation reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleCSPViolation } from '@/lib/security-monitoring';
import { getClientIP } from '@/lib/requestUtils';

export async function POST(request: NextRequest) {
  try {
    // Parse the CSP violation report
    const violationReport = await request.json();

    // Extract client information
    const clientInfo = {
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    };

    // Handle the violation
    await handleCSPViolation(violationReport, clientInfo);

    // Return success response
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error processing CSP violation report:', error);
    return NextResponse.json(
      { error: 'Failed to process report' },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
