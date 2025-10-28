/**
 * Tests for data mappers
 */

import { describe, it, expect } from 'vitest';
import { 
  mapBookingFromDb, 
  mapAccessFromDb, 
  mapUserFromDb, 
  mapCheckinFromDb 
} from '@/lib/mappers/domainMappers';

describe('domainMappers', () => {
  describe('mapBookingFromDb', () => {
    it('should map database booking to domain booking', () => {
      const now = new Date();
      const bookingDb = {
        id: 'booking-123',
        source: 'external',
        reference: 'REF123',
        lastNameHash: 'hashed_lastname',
        lastNameSalt: 'salt123',
        lastNameToken: 'token123',
        lastNameTokenNoWs: 'token_nowhitespace',
        startDate: new Date('2023-06-01'),
        endDate: new Date('2023-06-07'),
        userId: 'user-123',
        createdAt: now
      };

      const result = mapBookingFromDb(bookingDb);

      expect(result).toEqual({
        id: 'booking-123',
        source: 'external',
        reference: 'REF123',
        last_name_hash: 'hashed_lastname',
        last_name_salt: 'salt123',
        last_name_token: 'token123',
        last_name_token_nows: 'token_nowhitespace',
        start_date: '2023-06-01T00:00:00.000Z',
        end_date: '2023-06-07T00:00:00.000Z',
        user_id: 'user-123',
        created_at: now.getTime()
      });
    });

    it('should handle null values gracefully', () => {
      const now = new Date();
      const bookingDb = {
        id: 'booking-123',
        source: 'external',
        reference: null,
        lastNameHash: null,
        lastNameSalt: null,
        lastNameToken: null,
        lastNameTokenNoWs: null,
        startDate: new Date('2023-06-01'),
        endDate: new Date('2023-06-07'),
        userId: null,
        createdAt: now
      };

      const result = mapBookingFromDb(bookingDb);

      expect(result).toEqual({
        id: 'booking-123',
        source: 'external',
        start_date: '2023-06-01T00:00:00.000Z',
        end_date: '2023-06-07T00:00:00.000Z',
        created_at: now.getTime()
      });
    });
  });

  describe('mapAccessFromDb', () => {
    it('should map database access to domain access', () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 3600000); // 1 hour ago
      const updatedAt = new Date(now.getTime() - 1800000); // 30 minutes ago
      
      const accessDb = {
        userId: 'user-123',
        bookingId: 'booking-123',
        status: 'active',
        createdAt,
        updatedAt
      };

      const result = mapAccessFromDb(accessDb);

      expect(result).toEqual({
        user_id: 'user-123',
        booking_id: 'booking-123',
        status: 'active',
        created_at: createdAt.getTime(),
        updated_at: updatedAt.getTime()
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
        countryOrigin: 'US',
        createdAt,
        updatedAt
      };

      const result = mapUserFromDb(userDb);

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        phone_e164: '+1234567890',
        password_hash: 'hashed_password',
        country_origin: 'US',
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
        countryOrigin: 'US',
        createdAt,
        updatedAt
      };

      const result = mapUserFromDb(userDb);

      expect(result).toEqual({
        id: 'user-123',
        phone_e164: '+1234567890',
        country_origin: 'US',
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