/**
 * Tests for data mappers
 */


import {
  mapBookingFromDb,
  mapUserFromDb,
  mapCheckinFromDb
} from '@/lib/mappers/domainMappers';

describe('domainMappers', () => {
  describe('mapBookingFromDb', () => {
    it('should map database booking to domain booking', () => {
      const now = new Date();
      const bookingDb = {
        id: 'booking-123',
        source: 'EXTERNAL' as const,
        reference: 'REF123',
        startDate: new Date('2023-06-01'),
        endDate: new Date('2023-06-07'),
        userId: 'user-123',
        provider: 'booking-com',
        externalReference: 'EXT-123',
        accessStatus: 'VERIFIED' as const,
        claimedAt: now,
        createdAt: now
      };

      const result = mapBookingFromDb(bookingDb);

      expect(result).toEqual({
        id: 'booking-123',
        source: 'EXTERNAL',
        reference: 'REF123',
        start_date: '2023-06-01T00:00:00.000Z',
        end_date: '2023-06-07T00:00:00.000Z',
        user_id: 'user-123',
        provider: 'booking-com',
        external_reference: 'EXT-123',
        access_status: 'VERIFIED',
        claimed_at: now.getTime(),
        created_at: now.getTime()
      });
    });

    it('should handle null values gracefully', () => {
      const now = new Date();
      const bookingDb = {
        id: 'booking-123',
        source: 'EXTERNAL' as const,
        reference: null,
        startDate: new Date('2023-06-01'),
        endDate: new Date('2023-06-07'),
        userId: null,
        provider: 'legacy',
        externalReference: null,
        accessStatus: 'PENDING' as const,
        claimedAt: null,
        createdAt: now
      };

      const result = mapBookingFromDb(bookingDb);

      expect(result).toEqual({
        id: 'booking-123',
        source: 'EXTERNAL',
        start_date: '2023-06-01T00:00:00.000Z',
        end_date: '2023-06-07T00:00:00.000Z',
        provider: 'legacy',
        access_status: 'PENDING',
        created_at: now.getTime()
      });
    });
  });

  describe('mapUserFromDb', () => {
    it('should map database user to domain user', () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 86400000); // 1 day ago
      const updatedAt = new Date(now.getTime() - 3600000); // 1 hour ago

      const userDb = {
        id: 'user-123',
        email: 'test@example.com',
        phoneE164: '+1234567890',
        passwordHash: 'hashed_password',
        countryOrigin: 'ABROAD' as const,
        createdAt,
        updatedAt
      };

      const result = mapUserFromDb(userDb);

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        phone_e164: '+1234567890',
        password_hash: 'hashed_password',
        country_origin: 'ABROAD',
        created_at: createdAt.getTime(),
        updated_at: updatedAt.getTime()
      });
    });

    it('should handle null values gracefully', () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 86400000); // 1 day ago
      const updatedAt = new Date(now.getTime() - 3600000); // 1 hour ago

      const userDb = {
        id: 'user-123',
        email: null,
        phoneE164: '+1234567890',
        passwordHash: null,
        countryOrigin: 'ABROAD' as const,
        createdAt,
        updatedAt
      };

      const result = mapUserFromDb(userDb);

      expect(result).toEqual({
        id: 'user-123',
        phone_e164: '+1234567890',
        country_origin: 'ABROAD',
        created_at: createdAt.getTime(),
        updated_at: updatedAt.getTime()
      });
    });
  });

  describe('mapCheckinFromDb', () => {
    it('should map database check-in to domain check-in', () => {
      const now = new Date();
      const acceptedAt = new Date(now.getTime() - 3600000); // 1 hour ago

      const checkinDb = {
        bookingId: 'booking-123',
        arrivalTime: '14:30',
        specialRequests: 'Late check-in requested',
        acceptedAt
      };

      const result = mapCheckinFromDb(checkinDb);

      expect(result).toEqual({
        booking_id: 'booking-123',
        arrival_time: '14:30',
        special_requests: 'Late check-in requested',
        accepted_at: acceptedAt.getTime()
      });
    });

    it('should handle null special requests gracefully', () => {
      const now = new Date();
      const acceptedAt = new Date(now.getTime() - 3600000); // 1 hour ago

      const checkinDb = {
        bookingId: 'booking-123',
        arrivalTime: '14:30',
        specialRequests: null,
        acceptedAt
      };

      const result = mapCheckinFromDb(checkinDb);

      expect(result).toEqual({
        booking_id: 'booking-123',
        arrival_time: '14:30',
        accepted_at: acceptedAt.getTime()
      });
    });
  });
});
