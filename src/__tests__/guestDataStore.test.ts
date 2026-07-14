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
