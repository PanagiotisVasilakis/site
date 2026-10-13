"use client";
import { Icon } from '@/components/icons/Icon';
import { toSafeLocalPath } from '@/lib/safeLocalPath';

const OFFLINE_PATHS = ['/offline', '/en/offline', '/el/offline'];

/**
 * Where Retry goes: the page the service worker could not open, which it names in the `from` of the offline URL
 * (`/{locale}/offline?from=<page>`, R-648). `from` comes from the address bar, so it must be a safe local path, and
 * not an offline page (that would only bring the guest back here). toSafeLocalPath still returns `//host` for
 * `/.//host` (dot segments leave an empty one), which a browser reads as another site: refused here.
 */
function retryTarget(search: string): string | null {
  const target = toSafeLocalPath(new URLSearchParams(search).get('from'));
  if (!target || target.startsWith('//')) return null;
  return OFFLINE_PATHS.includes(target.split(/[?#]/, 1)[0]) ? null : target;
}

function retry() {
  const target = retryTarget(window.location.search);
  if (target) window.location.assign(target);
  else window.location.reload();
}

/**
 * identity §9.11: Retry plus the pages a guest may have opened before, as `link-arrow` rows. Plain anchors
 * (not next/link): offline, a full navigation lets the service worker answer from its page cache. Retry goes back
 * to the page named in `?from=`; without a usable one (the root /offline page, an offline page opened directly) it reloads.
 */
export default function OfflineActions({ retryLabel, links }: { retryLabel: string; links: Array<{ href: string; label: string }> }) {
  return (
    <ul className="status-page__links">
      <li>
        <button type="button" onClick={retry} className="ui-btn ui-btn--link-arrow status-page__link">
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
