import { describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger-enterprise';
import { logSecurityDiagnostic } from '@/lib/security-monitoring';

function sanitizedDetails(details: Record<string, unknown>): unknown {
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  logSecurityDiagnostic({
    type: 'api_security_violation',
    severity: 'medium',
    timestamp: new Date().toISOString(),
    ip: 'unknown',
    url: '/api/example',
    details,
  });
  return (warn.mock.calls[0][1] as { details: unknown }).details;
}

describe('security event detail sanitization', () => {
  it('leaves an absent field out instead of storing the text "undefined"', () => {
    const details = sanitizedDetails({ kept: 'value', absent: undefined, nested: { absent: undefined, kept: 1 } });

    expect(details).toEqual({ kept: 'value', nested: { kept: 1 } });
    expect(JSON.stringify(details)).not.toContain('undefined');
  });

  it('keeps null and false, which are values', () => {
    expect(sanitizedDetails({ none: null, off: false, zero: 0 })).toEqual({ none: null, off: false, zero: 0 });
  });

  it('keeps the position of an undefined array slot as null', () => {
    expect(sanitizedDetails({ list: [undefined, 'x'] })).toEqual({ list: [null, 'x'] });
  });

  it('does not let absent fields use up the 30-field budget', () => {
    const fields: Record<string, unknown> = {};
    for (let index = 0; index < 40; index += 1) fields[`absent${index}`] = undefined;
    for (let index = 0; index < 5; index += 1) fields[`present${index}`] = index;

    expect(Object.keys(sanitizedDetails(fields) as object)).toEqual([
      'present0', 'present1', 'present2', 'present3', 'present4',
    ]);
  });
});
