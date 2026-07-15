import { buildTopPaths } from './ObservabilityDashboard';

describe('observability pageview aggregates', () => {
  it('keeps custom events out of Top Paths when passed pageviews only', () => {
    const hits = [
      { path: '/en' },
      { path: '/en' },
      { path: '/en/check-in', eventName: 'checkin_viewed' },
    ];
    expect(buildTopPaths(hits.filter((hit) => !hit.eventName))).toEqual([{ path: '/en', count: 2 }]);
  });
});
