import { describe, expect, it } from 'vitest';

import { isSensitiveFieldName, redactSensitiveText } from './redaction';

describe('redaction helpers', () => {
  it('redacts email, phone, and long token shapes', () => {
    const token = `${'a'.repeat(24)}.${'b'.repeat(24)}.signature`;
    expect(redactSensitiveText(`guest@example.com +30 690 000 0000 ${token}`)).toBe(
      '[REDACTED_EMAIL] [REDACTED_PHONE] [REDACTED_TOKEN]',
    );
  });

  it('does not mistake ordinary dates for phone numbers', () => {
    expect(redactSensitiveText('2026-07-14')).toBe('2026-07-14');
  });

  it('normalizes sensitive field names', () => {
    expect(isSensitiveFieldName('user-agent')).toBe(true);
    expect(isSensitiveFieldName('status')).toBe(false);
  });
});
