import { propertyDateTimeToUtc, wifiDisclosureWindow } from '@/lib/propertyTime';

describe('property time boundaries', () => {
  it('converts Athens summer wall time to UTC', () => {
    expect(propertyDateTimeToUtc(new Date('2026-07-20T00:00:00.000Z'), '15:00', 'Europe/Athens').toISOString())
      .toBe('2026-07-20T12:00:00.000Z');
  });

  it('reveals Wi-Fi 24 hours before check-in and keeps it through checkout time', () => {
    const window = wifiDisclosureWindow({
      startDate: new Date('2026-07-20T00:00:00.000Z'),
      endDate: new Date('2026-07-25T00:00:00.000Z'),
      checkInTime: '15:00',
      checkOutTime: '11:00',
      timeZone: 'Europe/Athens',
    });
    expect(window.revealAt.toISOString()).toBe('2026-07-19T12:00:00.000Z');
    expect(window.expiresAt.toISOString()).toBe('2026-07-25T08:00:00.000Z');
  });
});
