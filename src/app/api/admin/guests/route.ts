import { NextRequest, NextResponse } from 'next/server';
import { guestDataExport } from '@/lib/guestDataExport';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { isAdminRequest } from '@/lib/rbac';
import { checkInRequestRepository } from '@/lib/prisma-repositories/checkInRequestRepository';

interface QueryParams {
  action?: string;
  reference?: string;
  phone?: string;
  bookingId?: string;
  startDate?: string;
  endDate?: string;
}

const guard = createAPISecurityMiddleware();

const handler = async (request: NextRequest) => {
  const earlyResponse = guard(request);
  if (earlyResponse) return earlyResponse;

  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required');
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

  try {
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

      case 'findById':
        if (!params.bookingId) {
          throw new ApiError(
            ApiErrorCode.VALIDATION_ERROR,
            'Missing required parameter: bookingId'
          );
        }
  const bookingById = await guestDataExport.getBookingById(params.bookingId);
        if (!bookingById) {
          throw new ApiError(
            ApiErrorCode.NOT_FOUND,
            'Booking not found'
          );
        }
        return createSuccessResponse({ booking: bookingById });

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

      case 'requests':
        const requests = await checkInRequestRepository.getAll();
        return createSuccessResponse({
          requests: requests.map((request) => ({
            id: request.id,
            bookingId: request.booking_id,
            userId: request.user_id,
            guestName: request.guest_name,
            guestEmail: request.guest_email,
            guestPhone: request.guest_phone,
            requestedTime: request.requested_time,
            message: request.message,
            status: request.status.toLowerCase(),
            createdAt: new Date(request.created_at).toISOString(),
            updatedAt: new Date(request.updated_at).toISOString(),
          })),
          total: requests.length,
        });

      case 'export':
        if (!params.bookingId) {
          throw new ApiError(
            ApiErrorCode.VALIDATION_ERROR,
            'Missing required parameter: bookingId'
          );
        }
  const exportData = await guestDataExport.exportBookingToFile(params.bookingId);
        if (!exportData) {
          throw new ApiError(
            ApiErrorCode.NOT_FOUND,
            'Booking not found or export failed'
          );
        }
        
        // Return as downloadable JSON using NextResponse
        return NextResponse.json(JSON.parse(exportData), {
          headers: {
            'Content-Disposition': `attachment; filename="booking_${params.bookingId}_${Date.now()}.json"`,
          },
        });

      default:
        throw new ApiError(
          ApiErrorCode.VALIDATION_ERROR,
          'Invalid action. Supported actions: list, find, findById, phone, search, stats, requests, export'
        );
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'Failed to query guest data',
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
};

export const GET = withErrorHandler(handler);
