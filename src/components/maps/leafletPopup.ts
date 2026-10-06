import type { LeafletMapLabels, LeafletMarkerData } from '@/components/LeafletMap';
import { telHref } from '@/lib/contactLinks';

export function escapeMapHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function popupLink(href: string | undefined, label: string, external: boolean): string {
  if (!href) return '';
  const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a class="map-popup__link shell-link" href="${escapeMapHtml(href)}"${target}>${escapeMapHtml(label)}</a>`;
}

/**
 * The marker popup (identity §8 MapCard): a compact GuideCard with the meta line (category · distance),
 * the title, a two-line summary, the phone numbers as tel: links, the address when there is no meta
 * line, and Directions / Website / Details. Every value is escaped; styles in src/styles/components/map.css.
 */
export function buildBasePopupHtml(
  marker: LeafletMarkerData,
  labels: LeafletMapLabels,
): string {
  const phones = marker.phones?.length ? marker.phones : marker.phone ? [marker.phone] : [];
  const phoneHtml = phones.map((phone) => (
    `<a class="map-popup__contact shell-link" href="${escapeMapHtml(telHref(phone) ?? '')}">${escapeMapHtml(phone)}</a>`
  )).join('');
  const actionLinks = [
    popupLink(marker.directionsUrl, labels.directions, true),
    popupLink(marker.website, labels.website, true),
    popupLink(marker.href, labels.details, false),
  ].filter(Boolean).join('');

  return `
    <article class="map-popup">
      ${marker.meta ? `<p class="map-popup__meta">${escapeMapHtml(marker.meta)}</p>` : ''}
      <h3 class="map-popup__title">${escapeMapHtml(marker.name)}</h3>
      ${marker.description ? `<p class="map-popup__text">${escapeMapHtml(marker.description)}</p>` : ''}
      ${!marker.meta && marker.address ? `<p class="map-popup__row"><span class="sr-only">${escapeMapHtml(labels.address)}: </span>${escapeMapHtml(marker.address)}</p>` : ''}
      ${phoneHtml ? `<p class="map-popup__row map-popup__contacts"><span class="sr-only">${escapeMapHtml(labels.phone)}: </span>${phoneHtml}</p>` : ''}
      ${actionLinks ? `<p class="map-popup__actions">${actionLinks}</p>` : ''}
    </article>
  `;
}
