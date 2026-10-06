import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/icons/BrandMark';
import { Icon } from '@/components/icons/Icon';

type StatusPageProps = {
  title: string;
  lead?: string;
  /** `status` makes the title and lead a polite live region (portal refresh). */
  role?: 'status';
  children?: ReactNode;
};

/**
 * The calm, centred status layout of identity §9.8 (portal refresh), §9.10 (404, errors) and §9.11 (offline):
 * the 96 px brand mark, an H1, a lead, then the actions. No photo, no motion (styles in components/stay.css).
 */
export function StatusPage({ title, lead, role, children }: StatusPageProps) {
  return (
    <div className="status-page">
      <span className="status-page__mark" aria-hidden="true"><BrandMark /></span>
      <div className="status-page__text" role={role}>
        <h1 className="status-page__title">{title}</h1>
        {lead ? <p className="status-page__lead">{lead}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** `link-arrow` rows (§8 Button) under a status page. */
export function StatusLinks({ links }: { links: Array<{ href: string; label: string }> }) {
  return (
    <ul className="status-page__links">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className="ui-btn ui-btn--link-arrow status-page__link">
            {link.label}
            <Icon name="arrow-right" size={18} className="ui-btn__arrow" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
