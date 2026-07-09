import { buildBasePopupHtml, escapeMapHtml } from '@/components/maps/leafletPopup';

describe('leaflet popup presentation', () => {
  it('escapes untrusted marker content and action URLs', () => {
    const html = buildBasePopupHtml({
      id: 'marker',
      name: '<script>alert(1)</script>',
      description: 'Safe & useful',
      website: 'https://example.com/?q="quoted"',
      coordinates: [22.1, 37.04],
    }, {
      address: 'Address',
      phone: 'Phone',
      directions: 'Directions',
      website: 'Website',
      details: 'Details',
      locateMe: 'Locate',
      fitToMarkers: 'Fit',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      apartment: 'Apartment',
      approximate: 'Approximate',
      travelUnavailable: 'Unavailable',
      travelUnavailableWithDirections: 'Unavailable',
      clearRoute: 'Clear',
      route: 'Route',
      driving: 'Driving',
      walking: 'Walking',
      cycling: 'Cycling',
      unavailable: 'Unavailable',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;quoted&quot;');
  });

  it('normalizes all HTML-sensitive characters', () => {
    expect(escapeMapHtml(`<a href="'">&`)).toBe('&lt;a href=&quot;&#39;&quot;&gt;&amp;');
  });
});
