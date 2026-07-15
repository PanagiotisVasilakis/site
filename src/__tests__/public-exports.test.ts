import { type MarkerData as InteractiveMarkerData } from '@/components/InteractiveMap';
import { type BookingSource as SessionBookingSource, type BookingStatus } from '@/lib/guestSession';
import { type SecurityConfig } from '@/lib/security-config';
import { type SecurityMetrics } from '@/lib/security-monitoring';
import { type ApiResponse, type ApiRouteHandler, type ErrorHandlerConfig } from '@/lib/apiErrorHandler';
import { type Dictionary as IndexDictionary } from '@/i18n';
import { type Dictionary as I18nDictionary } from '@/i18n/dictionaries';
import { type TrackerEventName, type EventProps } from '@/lib/tracker';
import { type Origin } from '@/lib/phone';
import { type LogContext, type LogLevel, type LogEntry } from '@/lib/logger-enterprise';
import { type BookingSource, type AccessStatus, type GuestRefreshTokenRec } from '@/lib/guestDataStore';
import { type VillaPhoto } from '@/types/villa';
import { type AppConfig } from '@/lib/config';
import { type Role } from '@/lib/rbac';
import { type LeafletMapProps } from '@/components/LeafletMap';
import { type MarkerData as LazyMapMarkerData } from '@/components/InteractiveMap';
import { type TravelMode } from '@/lib/travelFormat';

// Browser-only globals used by imported client utilities.
vi.stubGlobal('BroadcastChannel', class {
  postMessage() { }
  close() { }
});

vi.stubGlobal('crypto', { randomUUID: () => 'abcd1234efgh5678ijkl9012mnop3456' });

// Skip tests if database URL is not configured (some imports require DB)
const hasDbUrl = !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
describe.skipIf(!hasDbUrl)('public API surface remains reachable', () => {
  it('validates utilities and classes are importable', async () => {
    const { validateOpenAPISpec } = await import('@/lib/openapi');
    const { createMarkerFromItem } = await import('@/components/InteractiveMap');
    const { clearSessionCookie, clearRefreshCookie } = await import('@/lib/guestSession');
    const { getSecurityConfig, validateSecurityConfig } = await import('@/lib/security-config');
    const { SecurityReportGenerator } = await import('@/lib/security-monitoring');
    const { resetFeatureFlags } = await import('@/lib/featureFlags');
    const {
      ApiError,
      ValidationError,
      TimeoutError,
      RateLimitError,
      HttpStatus,
      success,
      error,
      validationError,
      rateLimitError,
      timeoutError,
    } = await import('@/lib/apiErrorHandler');
    const { formatDateRangeCompact, parseDate, isPastDate } = await import('@/lib/dateUtils');
    const { locales, defaultLocale } = await import('@/i18n');
    const { GuestDataExport } = await import('@/lib/guestDataExport');
    const { categorizeReason, track, tracker } = await import('@/lib/tracker');
    const { emitGuestSessionChanged } = await import('@/lib/sessionSignals');
    const { SpanStatus } = await import('@/lib/distributed-tracing');

    expect(validateOpenAPISpec()).toBe(true);

    const marker = createMarkerFromItem(
      {
        id: 'x',
        name: 'Test',
        location: { lat: 0, lng: 0 },
        slug: 'x'
      },
      'attractions',
      'en'
    );
    expect(marker?.id).toBe('x');

    expect(clearSessionCookie().name).toBeDefined();
    expect(clearRefreshCookie().name).toBeDefined();

    expect(getSecurityConfig().csp.enabled).toBe(true);
    validateSecurityConfig();
    expect(new SecurityReportGenerator().generateWeeklyTrends()).toBeTruthy();

    resetFeatureFlags();

    expect(() => new ValidationError([])).not.toThrow();
    expect(new TimeoutError(1000).message).toContain('1000');
    expect(HttpStatus.OK).toBe(200);
    expect(success({ ok: true }).status).toBe(200);
    expect(error).toBe(ApiError);
    expect(validationError).toBe(ValidationError);
    expect(rateLimitError).toBe(RateLimitError);
    expect(timeoutError).toBe(TimeoutError);


    expect(formatDateRangeCompact({ from: new Date('2024-01-01'), to: new Date('2024-01-05') })).toMatch(/\d/);
    expect(parseDate('2024-01-01')).toBeInstanceOf(Date);
    expect(isPastDate(new Date(Date.now() - 86400000))).toBe(true);

    expect(locales.includes(defaultLocale)).toBe(true);

    const exporter = new GuestDataExport();
    const exportedBookings = await exporter.getAllBookings();
    expect(Array.isArray(exportedBookings)).toBe(true);
    expect(typeof categorizeReason).toBe('function');
    tracker.portalOpened('test');
    expect(() => track({ name: 'checkin_viewed', props: {} })).not.toThrow();

    emitGuestSessionChanged('test');

    expect([SpanStatus.TIMEOUT, SpanStatus.CANCELLED]).toHaveLength(2);
  });

  it('ensures exported types remain available', () => {
    expectTypeOf<LogContext>().toBeObject();
    expectTypeOf<LogLevel>().toEqualTypeOf<'debug' | 'info' | 'warn' | 'error' | 'trace' | 'fatal'>();
    expectTypeOf<LogEntry>().toMatchTypeOf<{ level: LogLevel }>();
    expectTypeOf<BookingSource>().toMatchTypeOf<'ONSITE' | 'EXTERNAL'>();
    expectTypeOf<AccessStatus>().toMatchTypeOf<string>();

    expectTypeOf<GuestRefreshTokenRec>().toMatchTypeOf<{ id: string }>();
    expectTypeOf<InteractiveMarkerData>().toMatchTypeOf<{ id: string }>();
    expectTypeOf<SessionBookingSource>().toMatchTypeOf<'ONSITE' | 'EXTERNAL'>();
    expectTypeOf<BookingStatus>().toMatchTypeOf<string>();
    expectTypeOf<Origin>().toMatchTypeOf<string>();
    expectTypeOf<SecurityConfig>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<SecurityMetrics>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<I18nDictionary>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<ApiResponse<unknown>>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<ApiRouteHandler>().toMatchTypeOf<(...args: any[]) => any>();
    expectTypeOf<ErrorHandlerConfig>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<AppConfig>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<IndexDictionary>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<VillaPhoto>().toMatchTypeOf<{ src: string }>();
    expectTypeOf<Role>().toMatchTypeOf<string>();
    expectTypeOf<TrackerEventName>().toMatchTypeOf<string>();
    expectTypeOf<EventProps>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<LeafletMapProps>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<LazyMapMarkerData>().toMatchTypeOf<{ id: string }>();
    expectTypeOf<TravelMode>().toMatchTypeOf<'driving' | 'foot' | 'cycling'>();
  });
});
