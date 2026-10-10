import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guestDataExport } from '@/lib/guestDataExport';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { isAdminRequest } from '@/lib/rbac';

interface QueryParams {
  action?: string;
  reference?: string;
  phone?: string;
  bookingId?: string;
  startDate?: string;
  endDate?: string;
}

const isoDate = z.iso.date();

const handler = async (request: NextRequest) => {
  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
  }

  const { searchParams } = new URL(request.url);
  const params: QueryParams = {
    action: searchParams.get('action') || undefined,
    reference: searchParams.get('reference') || undefined,
    phone: searchParams.get('phone') || undefined,
    bookingId: searchParams.get('bookingId') || undefined,
    startDate: searchParams.get('startDate') || undefined,
    endDate: searchParams.get('endDate') || undefined,
  };

  switch (params.action) {
    case 'list':
      const allBookings = await guestDataExport.getAllBookings();
      return createSuccessResponse({
        bookings: allBookings,
        total: allBookings.length,
      });

    case 'find':
      if (!params.reference) {
        throw new ApiError(
          ApiErrorCode.VALIDATION_ERROR,
          'Missing required parameter: reference'
        );
      }
      const booking = await guestDataExport.getBookingByReference(params.reference);
      if (!booking) {
        throw new ApiError(
          ApiErrorCode.NOT_FOUND,
          'Booking not found'
        );
      }
      return createSuccessResponse({ booking });

    case 'phone':
      if (!params.phone) {
        throw new ApiError(
          ApiErrorCode.VALIDATION_ERROR,
          'Missing required parameter: phone'
        );
      }
      const phoneBookings = await guestDataExport.getBookingsByPhone(params.phone);
      return createSuccessResponse({
        bookings: phoneBookings,
        total: phoneBookings.length,
      });

    case 'search':
      if (!params.startDate) {
        throw new ApiError(
          ApiErrorCode.VALIDATION_ERROR,
          'Missing required parameter: startDate'
        );
      }
      if (!isoDate.safeParse(params.startDate).success || !isoDate.optional().safeParse(params.endDate).success) {
        throw new ApiError(
          ApiErrorCode.VALIDATION_ERROR,
          'startDate and endDate must be YYYY-MM-DD'
        );
      }
      const searchResults = await guestDataExport.searchBookingsByDateRange(
        params.startDate,
        params.endDate
      );
      return createSuccessResponse({
        bookings: searchResults,
        total: searchResults.length,
        dateRange: {
          startDate: params.startDate,
          endDate: params.endDate,
        },
      });

    case 'stats':
      const statistics = await guestDataExport.getStatistics();
      return createSuccessResponse({ statistics });

    case 'export':
      if (!params.bookingId) {
        throw new ApiError(
          ApiErrorCode.VALIDATION_ERROR,
          'Missing required parameter: bookingId'
        );
      }
      if (!z.uuid().safeParse(params.bookingId).success) {
        throw new ApiError(ApiErrorCode.NOT_FOUND, 'Booking not found');
      }
      const exportData = await guestDataExport.getBookingDetails(params.bookingId);
      if (!exportData) {
        throw new ApiError(
          ApiErrorCode.NOT_FOUND,
          'Booking not found'
        );
      }
      
      // Return as downloadable JSON using NextResponse
      return NextResponse.json(exportData, {
        headers: {
          'Content-Disposition': `attachment; filename="booking_${params.bookingId}_${Date.now()}.json"`,
          'Cache-Control': 'no-store',
        },
      });

    default:
      throw new ApiError(
        ApiErrorCode.VALIDATION_ERROR,
        'Invalid action. Supported actions: list, find, phone, search, stats, export'
      );
  }
};

export const GET = withErrorHandler(handler);
