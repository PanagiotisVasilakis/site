import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guestDataExport } from '@/lib/guestDataExport';
import { withErrorHandler, createSuccessResponse, requireAdminRequest, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';

const isoDate = z.iso.date();

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdminRequest(request);

  const { searchParams } = new URL(request.url);
  const param = (name: string) => searchParams.get(name) || undefined;

  switch (param('action')) {
    case 'list': {
      const bookings = await guestDataExport.getAllBookings();
      return createSuccessResponse({ bookings, total: bookings.length });
    }

    case 'find': {
      const reference = param('reference');
      if (!reference) {
        throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Missing required parameter: reference');
      }
      const booking = await guestDataExport.getBookingByReference(reference);
      if (!booking) {
        throw new ApiError(ApiErrorCode.NOT_FOUND, 'Booking not found');
      }
      return createSuccessResponse({ booking });
    }

    case 'phone': {
      const phone = param('phone');
      if (!phone) {
        throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Missing required parameter: phone');
      }
      const bookings = await guestDataExport.getBookingsByPhone(phone);
      return createSuccessResponse({ bookings, total: bookings.length });
    }

    case 'search': {
      const startDate = param('startDate');
      if (!startDate) {
        throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Missing required parameter: startDate');
      }
      if (!isoDate.safeParse(startDate).success) {
        throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'startDate must be YYYY-MM-DD');
      }
      const bookings = await guestDataExport.searchBookingsByDateRange(startDate);
      return createSuccessResponse({ bookings, total: bookings.length });
    }

    case 'stats': {
      const statistics = await guestDataExport.getStatistics();
      return createSuccessResponse({ statistics });
    }

    case 'export': {
      const bookingId = param('bookingId');
      if (!bookingId) {
        throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Missing required parameter: bookingId');
      }
      if (!z.uuid().safeParse(bookingId).success) {
        throw new ApiError(ApiErrorCode.NOT_FOUND, 'Booking not found');
      }
      const exportData = await guestDataExport.getBookingDetails(bookingId);
      if (!exportData) {
        throw new ApiError(ApiErrorCode.NOT_FOUND, 'Booking not found');
      }
      return NextResponse.json(exportData, {
        headers: {
          'Content-Disposition': `attachment; filename="booking_${bookingId}_${Date.now()}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    default:
      throw new ApiError(
        ApiErrorCode.VALIDATION_ERROR,
        'Invalid action. Supported actions: list, find, phone, search, stats, export'
      );
  }
});
