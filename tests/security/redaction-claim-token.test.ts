import { describe, expect, it } from 'vitest';

import { redactSensitiveText } from '@/lib/redaction';

describe('claim capability redaction', () => {
  it('redacts a booking claim token wherever it appears in free text', () => {
    const claimToken = `claim_${'A1b2C3d4E5'.repeat(4)}xyz`;

    expect(redactSensitiveText(`invalid grant ${claimToken}`)).toBe('invalid grant [REDACTED_TOKEN]');
    expect(redactSensitiveText(`token=${claimToken}`)).toBe('[REDACTED_TOKEN]');
  });

  it('keeps ordinary words that merely contain the prefix', () => {
    expect(redactSensitiveText('claim_status updated')).toBe('claim_status updated');
  });
});
