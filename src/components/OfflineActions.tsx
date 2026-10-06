"use client";
import { Icon } from '@/components/icons/Icon';

/**
 * identity §9.11: Retry plus the pages a guest may have opened before, as `link-arrow` rows. Plain anchors
 * (not next/link): offline, a full navigation lets the service worker answer from its page cache.
 */
export default function OfflineActions({ retryLabel, links }: { retryLabel: string; links: Array<{ href: string; label: string }> }) {
  return (
    <ul className="status-page__links">
      <li>
        <button type="button" onClick={() => window.location.reload()} className="ui-btn ui-btn--link-arrow status-page__link">
          {retryLabel}
          <Icon name="arrow-right" size={18} className="ui-btn__arrow" />
        </button>
      </li>
      {links.map((link) => (
        <li key={link.href}>
          <a href={link.href} className="ui-btn ui-btn--link-arrow status-page__link">
            {link.label}
            <Icon name="arrow-right" size={18} className="ui-btn__arrow" />
          </a>
        </li>
      ))}
    </ul>
  );
}
