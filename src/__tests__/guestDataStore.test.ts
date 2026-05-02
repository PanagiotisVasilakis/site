// Vitest globals are enabled; no named imports needed.
import { encryptJSON, decryptJSON, hashSensitive, verifySensitive } from '@/lib/crypto';

describe('crypto utils', () => {
  it('encrypts and decrypts JSON', () => {
    const obj = { a: 1, b: 'x' };
    const enc = encryptJSON(obj);
    const dec = decryptJSON<typeof obj>(enc);
    expect(dec).toEqual(obj);
  });
  it('hashSensitive and verifySensitive round-trip', () => {
    const { hash, salt } = hashSensitive('SECRET');
    expect(verifySensitive('SECRET', salt, hash)).toBe(true);
    expect(verifySensitive('WRONG', salt, hash)).toBe(false);
  });
});

// Skip tests if database URL is not configured
const hasDbUrl = !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
describe.skipIf(!hasDbUrl)('guest data store (dev)', () => {
  it.skip('creates user and links identity', async () => {
    const { guestStore } = await import('@/lib/guestDataStore');
    const user = await guestStore.createUser({ phone_e164: '+3000000000', country_origin: 'GR' });
    const id = await guestStore.upsertIdentity(user.id, 'AFM', '123456789');
    expect(id.user_id).toBe(user.id);
    expect(id.last4_mask?.endsWith('6789')).toBe(true);
  });
});
