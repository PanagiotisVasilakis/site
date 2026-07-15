import { describe, expect, it } from 'vitest';

import { refreshGenerationAdvisoryLockKey } from '@/lib/refreshRotationLock';

describe('refresh generation advisory lock key', () => {
  it.each([
    ['32000000-0000-4000-8000-000000000001', BigInt('3078507618389574402')],
    ['32000000-0000-4000-8000-000000000002', BigInt('-369568646094167838')],
    ['ffffffff-ffff-4fff-bfff-ffffffffffff', BigInt('8369558759014544714')],
    ['00000000-0000-4000-8000-000000000000', BigInt('-6338616838261462375')],
  ])('maps database generation %s to a stable signed bigint', (generationId, expected) => {
    expect(refreshGenerationAdvisoryLockKey(generationId)).toBe(expected);
    expect(refreshGenerationAdvisoryLockKey(generationId)).toBe(expected);
  });

  it('canonicalizes UUID letter casing without collapsing different generations', () => {
    const lower = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    const upper = lower.toUpperCase();
    const other = 'abcdefab-cdef-4abc-8def-abcdefabcdee';

    expect(refreshGenerationAdvisoryLockKey(upper))
      .toBe(refreshGenerationAdvisoryLockKey(lower));
    expect(refreshGenerationAdvisoryLockKey(other))
      .not.toBe(refreshGenerationAdvisoryLockKey(lower));
  });

  it.each([
    '',
    'not-a-database-id',
    '32000000-0000-4000-8000-000000000001.synthetic-secret',
    'synthetic-raw-refresh-secret',
    '32000000-0000-7000-8000-000000000001',
  ])('rejects non-database generation input without deriving a key', (input) => {
    expect(() => refreshGenerationAdvisoryLockKey(input))
      .toThrow('Refresh generation lock requires a database UUID');
  });
});
