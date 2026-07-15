const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((entry) => entry.type === type)?.value;
    if (!part) throw new Error(`Unable to resolve ${type} for ${timeZone}`);
    return Number.parseInt(part, 10);
  };
  const representedAsUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return representedAsUtc - instant.getTime();
}

function propertyDateTimeToUtc(date: Date, time: string, timeZone: string): Date {
  if (!timePattern.test(time)) throw new Error(`Invalid property time: ${time}`);
  const [hour, minute] = time.split(':').map(Number);
  const wallClockAsUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hour,
    minute,
  );

  let candidate = new Date(wallClockAsUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const adjusted = new Date(wallClockAsUtc - timeZoneOffsetMs(candidate, timeZone));
    if (adjusted.getTime() === candidate.getTime()) return adjusted;
    candidate = adjusted;
  }
  return candidate;
}

export function wifiDisclosureWindow(input: {
  startDate: Date;
  endDate: Date;
  checkInTime: string;
  checkOutTime: string;
  timeZone: string;
}): { revealAt: Date; expiresAt: Date } {
  const checkInAt = propertyDateTimeToUtc(input.startDate, input.checkInTime, input.timeZone);
  return {
    revealAt: new Date(checkInAt.getTime() - 24 * 60 * 60 * 1_000),
    expiresAt: propertyDateTimeToUtc(input.endDate, input.checkOutTime, input.timeZone),
  };
}
