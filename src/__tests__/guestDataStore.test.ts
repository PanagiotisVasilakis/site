// Vitest globals are enabled; no named imports needed.
import { encryptJSON, decryptJSON, hashSensitive, verifySensitive } from '@/lib/crypto';
import { guestStore } from '@/lib/guestDataStore';

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

describe('guest data store (dev)', () => {
  it('creates user and links identity', () => {
    const user = guestStore.createUser({ phone_e164: '+3000000000', country_origin: 'GR' });
    const id = guestStore.upsertIdentity(user.id, 'AFM', '123456789');
    expect(id.user_id).toBe(user.id);
    expect(id.last4_mask.endsWith('6789')).toBe(true);
  });
});
