import { describe, expect, it } from 'vitest';

import { phoneLookupCandidates } from '@/lib/phone';

describe('phoneLookupCandidates', () => {
  it('returns only the international reading when there is no Greek local form', () => {
    expect(phoneLookupCandidates('+49 171 2345678')).toEqual(['+491712345678']);
  });

  it('returns the international reading first, then the Greek local form', () => {
    expect(phoneLookupCandidates('691 234 5678')).toEqual(['+6912345678', '+306912345678']);
  });

  it('does not repeat a number that both readings produce', () => {
    expect(phoneLookupCandidates('+306912345678')).toEqual(['+306912345678']);
  });

  it('returns nothing for 10 digits starting with 0, whose international reading is invalid', () => {
    expect(phoneLookupCandidates('0123456789')).toEqual([]);
  });

  it('returns nothing for unparseable input', () => {
    expect(phoneLookupCandidates('not a phone')).toEqual([]);
    expect(phoneLookupCandidates('')).toEqual([]);
  });
});
