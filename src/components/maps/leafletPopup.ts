import type { LeafletMapLabels, LeafletMarkerData } from '@/components/LeafletMap';

export function escapeMapHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^+0-9]/g, '')}`;
}

function popupLink(href: string | undefined, label: string): string {
  if (!href) return '';
  return `<a class="map-popup-link" href="${escapeMapHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeMapHtml(label)}</a>`;
}

export function buildBasePopupHtml(
  marker: LeafletMarkerData,
  labels: LeafletMapLabels,
): string {
  const phones = marker.phones?.length ? marker.phones : marker.phone ? [marker.phone] : [];
  const phoneHtml = phones.map((phone) => (
    `<a class="map-popup-contact" href="${escapeMapHtml(phoneHref(phone))}">${escapeMapHtml(phone)}</a>`
  )).join('');
  const actionLinks = [
    popupLink(marker.directionsUrl, labels.directions),
    popupLink(marker.website, labels.website),
    popupLink(marker.href, labels.details),
  ].filter(Boolean).join('');

  return `
    <article class="map-popup">
      <h3>${escapeMapHtml(marker.name)}</h3>
      ${marker.description ? `<p>${escapeMapHtml(marker.description)}</p>` : ''}
      ${marker.address ? `<div class="map-popup-row"><strong>${escapeMapHtml(labels.address)}</strong><span>${escapeMapHtml(marker.address)}</span></div>` : ''}
      ${phoneHtml ? `<div class="map-popup-row"><strong>${escapeMapHtml(labels.phone)}</strong><span class="map-popup-contacts">${phoneHtml}</span></div>` : ''}
      ${actionLinks ? `<div class="map-popup-actions">${actionLinks}</div>` : ''}
    </article>
  `;
}
