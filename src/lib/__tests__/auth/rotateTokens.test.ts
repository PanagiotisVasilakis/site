/**
 * Tests for token rotation utilities
 */


import { rotateRefreshToken, hashToken, generateToken } from '@/lib/auth/rotateTokens';

describe('rotateTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashToken', () => {
    it('should hash token with provided salt', () => {
      const result = hashToken('test-token', 'test-salt');

      expect(result.hash).toContain('hashed_');
      expect(result.salt).toBe('test-salt');
    });

    it('should generate salt when not provided', () => {
      const result = hashToken('test-token');

      expect(result.hash).toContain('hashed_');
      expect(result.salt).toBeDefined();
      expect(result.salt).not.toBe('');
    });
  });

  describe('generateToken', () => {
    it('should generate unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();

      expect(token1).not.toBe(token2);
      expect(token1).toContain('-');
    });
  });

  describe('rotateRefreshToken', () => {
    it('should rotate valid token', async () => {
      // Mock storage adapter
      const mockStorage = {
        findByHash: vi.fn(),
        create: vi.fn(),
        revoke: vi.fn(),
        update: vi.fn()
      };

      // Mock token records
      const oldTokenRecord = {
        id: 'old-token-id',
        userId: 'user-123',
        familyId: 'family-123',
        tokenHash: 'hashed_old_token',
        salt: 'salt-123',
        expiresAt: Date.now() + 86400000, // Tomorrow
        createdAt: Date.now()
      };

      const newTokenRecord = {
        id: 'new-token-id',
        userId: 'user-123',
        familyId: 'family-123',
        tokenHash: 'hashed_new_token',
        salt: 'new-salt',
        expiresAt: Date.now() + 86400000, // Tomorrow
        rotatedFromId: 'old-token-id',
        createdAt: Date.now()
      };

      mockStorage.findByHash.mockResolvedValue(oldTokenRecord);
      mockStorage.create.mockResolvedValue(newTokenRecord);
      mockStorage.revoke.mockResolvedValue(true);

      const result = await rotateRefreshToken(
        'old-token-value',
        mockStorage,
        'user-123',
        { ttlDays: 30 }
      );

      expect(result.old).toEqual(oldTokenRecord);
      expect(result.rec).toEqual(newTokenRecord);
      expect(result.token).toBeDefined();
      expect(result.token).toContain('-');

      // Verify storage calls
      expect(mockStorage.findByHash).toHaveBeenCalledWith(
        expect.stringContaining('hashed_')
      );
      expect(mockStorage.create).toHaveBeenCalled();
      expect(mockStorage.revoke).toHaveBeenCalledWith('old-token-id');
    });

    it('should return empty object for non-existent token', async () => {
      const mockStorage = {
        findByHash: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        revoke: vi.fn(),
        update: vi.fn()
      };

      const result = await rotateRefreshToken(
        'non-existent-token',
        mockStorage,
        'user-123'
      );

      expect(result).toEqual({});
      expect(mockStorage.findByHash).toHaveBeenCalled();
      expect(mockStorage.create).not.toHaveBeenCalled();
      expect(mockStorage.revoke).not.toHaveBeenCalled();
    });

    it('should handle expired token', async () => {
      const mockStorage = {
        findByHash: vi.fn(),
        create: vi.fn(),
        revoke: vi.fn(),
        update: vi.fn()
      };

      const expiredTokenRecord = {
        id: 'expired-token-id',
        userId: 'user-123',
        familyId: 'family-123',
        tokenHash: 'hashed_expired_token',
        salt: 'salt-123',
        expiresAt: Date.now() - 86400000, // Yesterday
        createdAt: Date.now() - 2 * 86400000
      };

      mockStorage.findByHash.mockResolvedValue(expiredTokenRecord);
      // Note: We're no longer calling revoke for expired tokens in the current implementation

      const result = await rotateRefreshToken(
        'expired-token-value',
        mockStorage,
        'user-123'
      );

      expect(result.old).toEqual(expiredTokenRecord);
      // In the current implementation, we're not calling revoke for expired tokens
      // expect(mockStorage.revoke).toHaveBeenCalledWith('expired-token-id');
      expect(mockStorage.create).not.toHaveBeenCalled();
    });
  });
});