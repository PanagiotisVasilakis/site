import { hashSensitive } from '@/lib/crypto';

const { tx, prismaMock } = vi.hoisted(() => {
  const transactionClient = {
    refreshToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    refreshTokenFamily: {
      update: vi.fn(),
    },
  };

  return {
    tx: transactionClient,
    prismaMock: {
      $transaction: vi.fn(async (callback: (client: typeof transactionClient) => unknown) => (
        callback(transactionClient)
      )),
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger-enterprise', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { refreshTokenRepository } from '@/lib/prisma-repositories/refreshTokenRepository';

const OLD_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function tokenRecord(overrides: Record<string, unknown> = {}) {
  const { hash, salt } = hashSensitive('old-secret');
  return {
    id: OLD_ID,
    userId: USER_ID,
    tokenHash: hash,
    salt,
    familyId: 'family-1',
    createdAt: new Date(Date.now() - 1_000),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    rotatedFromId: null,
    lastUsedAt: null,
    deviceHint: null,
    ipHint: null,
    family: {
      id: 'family-1',
      userId: USER_ID,
      absoluteExpiresAt: new Date(Date.now() + 600_000),
      revokedAt: null,
      revocationReason: null,
      deviceHash: null,
      ipHash: null,
      createdAt: new Date(Date.now() - 1_000),
    },
    ...overrides,
  };
}

describe('refreshTokenRepository.rotate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('atomically revokes the old token and creates its replacement', async () => {
    const candidate = tokenRecord();
    const replacementSecret = hashSensitive('new-secret');
    const created = {
      ...candidate,
      id: NEW_ID,
      tokenHash: replacementSecret.hash,
      salt: replacementSecret.salt,
      createdAt: new Date(),
      revokedAt: null,
      rotatedFromId: OLD_ID,
    };
    tx.refreshToken.findUnique.mockResolvedValue(candidate);
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tx.refreshToken.create.mockResolvedValue(created);

    const result = await refreshTokenRepository.rotate(`${OLD_ID}.old-secret`, {
      tokenHash: replacementSecret.hash,
      salt: replacementSecret.salt,
      expiresAt: Date.now() + 120_000,
    });

    expect(result.status).toBe('rotated');
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: OLD_ID, revokedAt: null }),
    }));
    expect(tx.refreshToken.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: USER_ID,
        familyId: 'family-1',
        rotatedFromId: OLD_ID,
      }),
    }));
  });

  it('revokes the active token family when a revoked token is replayed', async () => {
    tx.refreshToken.findUnique.mockResolvedValue(tokenRecord({ revokedAt: new Date() }));
    tx.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    const replacement = hashSensitive('replacement');

    const result = await refreshTokenRepository.rotate(`${OLD_ID}.old-secret`, {
      tokenHash: replacement.hash,
      salt: replacement.salt,
      expiresAt: Date.now() + 120_000,
    });

    expect(result).toEqual({ status: 'replayed', familyId: 'family-1' });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.refreshTokenFamily.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ revocationReason: 'refresh_token_replay' }),
    }));
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('treats a same-context lost conditional revoke race as concurrent without revoking the family', async () => {
    tx.refreshToken.findUnique.mockResolvedValue(tokenRecord({
      family: {
        ...tokenRecord().family,
        deviceHash: 'device-hash',
        ipHash: 'ip-hash',
      },
    }));
    tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    const replacement = hashSensitive('replacement');

    const result = await refreshTokenRepository.rotate(`${OLD_ID}.old-secret`, {
      tokenHash: replacement.hash,
      salt: replacement.salt,
      expiresAt: Date.now() + 120_000,
      deviceHash: 'device-hash',
      ipHash: 'ip-hash',
    });

    expect(result).toEqual({ status: 'concurrent', familyId: 'family-1' });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.refreshTokenFamily.update).not.toHaveBeenCalled();
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('revokes the family when a different context loses the conditional revoke race', async () => {
    tx.refreshToken.findUnique.mockResolvedValue(tokenRecord({
      family: {
        ...tokenRecord().family,
        deviceHash: 'known-device-hash',
        ipHash: 'known-ip-hash',
      },
    }));
    tx.refreshToken.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const replacement = hashSensitive('replacement');

    const result = await refreshTokenRepository.rotate(`${OLD_ID}.old-secret`, {
      tokenHash: replacement.hash,
      salt: replacement.salt,
      expiresAt: Date.now() + 120_000,
      deviceHash: 'different-device-hash',
      ipHash: 'different-ip-hash',
    });

    expect(result).toEqual({ status: 'replayed', familyId: 'family-1' });
    expect(tx.refreshTokenFamily.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'family-1' },
      data: expect.objectContaining({ revocationReason: 'refresh_token_replay' }),
    }));
    expect(tx.refreshToken.updateMany).toHaveBeenLastCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('does not mutate token state when the supplied secret is invalid', async () => {
    tx.refreshToken.findUnique.mockResolvedValue(tokenRecord());
    const replacement = hashSensitive('replacement');

    const result = await refreshTokenRepository.rotate(`${OLD_ID}.wrong-secret`, {
      tokenHash: replacement.hash,
      salt: replacement.salt,
      expiresAt: Date.now() + 120_000,
    });

    expect(result).toEqual({ status: 'invalid' });
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });
});
