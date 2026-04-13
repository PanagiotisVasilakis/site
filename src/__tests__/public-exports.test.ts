import React from 'react';
import { validateOpenAPISpec } from '@/lib/openapi';
import { DevStoreBookingLookup, type Booking, type LookupByPhoneParams, type LookupByRefParams, type BookingLookupProvider } from '@/lib/bookingLookup';
import { createMarkerFromItem, type MarkerData as InteractiveMarkerData } from '@/components/InteractiveMap';
import { clearSessionCookie, clearRefreshCookie, type BookingSource as SessionBookingSource, type BookingStatus } from '@/lib/guestSession';
import { PerformanceBudgetValidator, performanceBudgetSchema, type PerformanceBudget } from '@/lib/performanceBudget';
import { getSecurityConfig, validateSecurityConfig, type SecurityConfig } from '@/lib/security-config';
import { SecurityReportGenerator, type SecurityMetrics } from '@/lib/security-monitoring';
import { resetFeatureFlags } from '@/lib/featureFlags';
import { ApiError, ValidationError, TimeoutError, RateLimitError, HttpStatus, success, error, validationError, rateLimitError, timeoutError, type ApiResponse, type ApiRouteHandler, type ErrorHandlerConfig } from '@/lib/apiErrorHandler';
import { AlertingSystem, type Alert, type NotificationChannel } from '@/lib/alerting-system';
import { formatDateRangeCompact, parseDate, isPastDate, type AvailabilityInfo } from '@/lib/dateUtils';
import { locales, defaultLocale, type Dictionary as IndexDictionary } from '@/i18n';
import { type Dictionary as I18nDictionary } from '@/i18n/dictionaries';
import { GuestDataExport } from '@/lib/guestDataExport';
import { resetFunnel } from '@/lib/analyticsClient';
import { categorizeReason, track, tracker, type TrackerEventName, type EventProps } from '@/lib/tracker';
import { internalFetch } from '@/lib/internalFetch';
import { emitGuestSessionChanged } from '@/lib/sessionSignals';
import { type Origin } from '@/lib/phone';
import { type LogContext, type LogLevel, type LogEntry } from '@/lib/logger-enterprise';
import { type Logger } from '@/lib/logger';
import { type IdentityType, type BookingSource, type AccessStatus, type BookingAccess, type GuestRefreshTokenRec } from '@/lib/guestDataStore';
import { type VillaPhoto } from '@/types/villa';
import { type AppConfig } from '@/lib/config';
import { type Role } from '@/lib/rbac';
import { type LeafletMapProps } from '@/components/LeafletMap';
import { type MarkerData as LazyMapMarkerData } from '@/components/InteractiveMap';
import { type TravelMode } from '@/lib/travelFormat';
import { type AnalyticsPersistenceData, type AnalyticsStorageAdapter } from '@/lib/storageAdapter';
import { SpanStatus } from '@/lib/distributed-tracing';

void React;

// Ensure React default export is referenced for client component re-exports
vi.stubGlobal('BroadcastChannel', class {
  postMessage() { }
  close() { }
});

vi.stubGlobal('crypto', { randomUUID: () => 'abcd1234efgh5678ijkl9012mnop3456' });

// Skip tests if database URL is not configured (some imports require DB)
const hasDbUrl = !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
describe.skipIf(!hasDbUrl)('public API surface remains reachable', () => {
  it('validates utilities and classes are importable', async () => {
    expect(validateOpenAPISpec()).toBe(true);

    const lookup = new DevStoreBookingLookup();
    expect(typeof lookup.lookupByReference).toBe('function');

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
    expect(marker.id).toBe('x');

    expect(clearSessionCookie().name).toBeDefined();
    expect(clearRefreshCookie().name).toBeDefined();

    const parsedBudget = performanceBudgetSchema.parse(defaultBudgetSample);
    expect(parsedBudget).toBeDefined();

    const validator = new PerformanceBudgetValidator();
    expect(typeof validator.validateBuildTime).toBe('function');

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

    expect(typeof AlertingSystem).toBe('function');

    expect(formatDateRangeCompact({ from: new Date('2024-01-01'), to: new Date('2024-01-05') })).toMatch(/\d/);
    expect(parseDate('2024-01-01')).toBeInstanceOf(Date);
    expect(isPastDate(new Date(Date.now() - 86400000))).toBe(true);

    expect(locales.includes(defaultLocale)).toBe(true);

    const exporter = new GuestDataExport();
    const exportedBookings = await exporter.getAllBookings();
    expect(Array.isArray(exportedBookings)).toBe(true);
    resetFunnel();
    expect(typeof categorizeReason).toBe('function');
    tracker.portalOpened('test');
    expect(() => track({ name: 'checkin_viewed', props: {} })).not.toThrow();

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    await internalFetch('/api/test');

    emitGuestSessionChanged('test');

    expect([SpanStatus.TIMEOUT, SpanStatus.CANCELLED]).toHaveLength(2);
  });

  it('ensures exported types remain available', () => {
    expectTypeOf<LogContext>().toBeObject();
    expectTypeOf<LogLevel>().toEqualTypeOf<'debug' | 'info' | 'warn' | 'error' | 'trace' | 'fatal'>();
    expectTypeOf<LogEntry>().toMatchTypeOf<{ level: LogLevel }>();
    expectTypeOf<Logger>().toBeObject();
    expectTypeOf<Booking>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<LookupByRefParams>().toMatchTypeOf<{ bookingRef: string }>();
    expectTypeOf<LookupByPhoneParams>().toMatchTypeOf<{ phone: string }>();
    expectTypeOf<BookingLookupProvider>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<IdentityType>().toMatchTypeOf<'AFM' | 'PASSPORT'>();
    expectTypeOf<BookingSource>().toMatchTypeOf<'ONSITE' | 'EXTERNAL'>();
    expectTypeOf<AccessStatus>().toMatchTypeOf<string>();
    expectTypeOf<BookingAccess>().toMatchTypeOf<{ status: AccessStatus }>();

    expectTypeOf<GuestRefreshTokenRec>().toMatchTypeOf<{ id: string }>();
    expectTypeOf<InteractiveMarkerData>().toMatchTypeOf<{ id: string }>();
    expectTypeOf<SessionBookingSource>().toMatchTypeOf<'ONSITE' | 'EXTERNAL'>();
    expectTypeOf<BookingStatus>().toMatchTypeOf<string>();
    expectTypeOf<PerformanceBudget>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<Origin>().toMatchTypeOf<string>();
    expectTypeOf<SecurityConfig>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<SecurityMetrics>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<I18nDictionary>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<ApiResponse<unknown>>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<ApiRouteHandler>().toMatchTypeOf<(...args: any[]) => any>();
    expectTypeOf<ErrorHandlerConfig>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<Alert>().toMatchTypeOf<{ id: string }>();
    expectTypeOf<NotificationChannel>().toMatchTypeOf<{ type: string }>();
    expectTypeOf<AppConfig>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<AvailabilityInfo>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<IndexDictionary>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<VillaPhoto>().toMatchTypeOf<{ src: string }>();
    expectTypeOf<Role>().toMatchTypeOf<string>();
    expectTypeOf<TrackerEventName>().toMatchTypeOf<string>();
    expectTypeOf<EventProps>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<LeafletMapProps>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<LazyMapMarkerData>().toMatchTypeOf<{ id: string }>();
    expectTypeOf<TravelMode>().toMatchTypeOf<'driving' | 'foot' | 'cycling'>();
    expectTypeOf<AnalyticsPersistenceData>().toMatchTypeOf<Record<string, any>>();
    expectTypeOf<AnalyticsStorageAdapter>().toMatchTypeOf<Record<string, any>>();
  });
});

const defaultBudgetSample = {
  buildTime: { max: 180000, warning: 120000 },
  bundleSize: {
    total: { max: 2097152, warning: 1048576 },
    individual: { max: 524288, warning: 262144 }
  },
  coreWebVitals: {
    lcp: { good: 2500, poor: 4000 },
    fid: { good: 100, poor: 300 },
    cls: { good: 0.1, poor: 0.25 },
    inp: { good: 200, poor: 500 },
    ttfb: { good: 800, poor: 1800 }
  },
  assets: { maxImageSize: 1048576, maxFontSize: 131072, totalAssetSize: 10485760 },
  dependencies: { maxTotal: 150, maxProduction: 50 }
} satisfies PerformanceBudget;
