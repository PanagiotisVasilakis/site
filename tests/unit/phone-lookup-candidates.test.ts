import { describe, expect, it } from 'vitest';

import { phoneLookupCandidates } from '@/lib/phone';

describe('phoneLookupCandidates', () => {
  it('returns the international reading first, then the Greek local form', () => {
    expect(phoneLookupCandidates('691 234 5678')).toEqual(['+6912345678', '+306912345678']);
  });

  it('returns nothing for 10 digits starting with 0, whose international reading is invalid', () => {
    expect(phoneLookupCandidates('0123456789')).toEqual([]);
  });
});
