// @vitest-environment node

import { logSecurityEvent, type SecurityEvent } from '@/lib/security-config';
import { recordSecurityEvent } from '@/lib/security-monitoring';

vi.mock('@/lib/security-monitoring', () => ({
  recordSecurityEvent: vi.fn(),
}));

describe('logSecurityEvent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not resolve until durable event recording has finished', async () => {
    let releasePersistence!: () => void;
    const persistence = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const recordMock = vi.mocked(recordSecurityEvent);
    recordMock.mockReturnValueOnce(persistence);

    const event: SecurityEvent = {
      type: 'auth_failure',
      severity: 'high',
      timestamp: new Date().toISOString(),
      ip: '192.0.2.5',
      url: '/api/portal/sessions',
      details: { reason: 'invalid_credentials' },
    };

    let completed = false;
    const result = logSecurityEvent(event).then(() => {
      completed = true;
    });

    await vi.waitFor(() => expect(recordMock).toHaveBeenCalledWith(event));
    expect(completed).toBe(false);

    releasePersistence();
    await result;

    expect(completed).toBe(true);
  });
});
