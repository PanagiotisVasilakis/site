import Link from 'next/link';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Icon, type IconName } from '@/components/icons/Icon';

type StayTileProps = {
  /** identity §8 Tile: `portal` on band-bg (CTA on-band), `locked` before sign-in, `default` a Card. */
  variant?: 'default' | 'portal' | 'locked';
  icon: IconName;
  title: string;
  text?: string;
  /** The tile's one primary link (on the title). A tile without `children` stretches it over the card. */
  href?: string;
  /** Shown inside the title link, after the title (the favourites count). */
  badge?: ReactNode;
  /** The portal tile's call to action: the look of an on-band button; the title link is the action. */
  cta?: string;
  /** `locked`: "Sign in to see". */
  lockedLabel?: string;
  className?: string;
  children?: ReactNode;
};

/** identity §8 Tile (stay hub, §9.4). Calm: no motion beyond the shared hover of cards. */
export function StayTile({ variant = 'default', icon, title, text, href, badge, cta, lockedLabel, className, children }: StayTileProps) {
  const locked = variant === 'locked';
  const linked = Boolean(href) && !locked;
  return (
    <div className={clsx('stay-tile', `stay-tile--${variant}`, linked && !children && 'stay-tile--stretch', className)}>
      <span className="stay-tile__icon" aria-hidden="true"><Icon name={locked ? 'lock' : icon} size={22} /></span>
      <h2 className="stay-tile__title">
        {linked && href ? (
          <Link href={href} className="stay-tile__link shell-link">
            {title}
            {badge ? <>{' '}{badge}</> : null}
          </Link>
        ) : title}
      </h2>
      {text ? <p className="stay-tile__text">{text}</p> : null}
      {locked && lockedLabel ? <p className="stay-tile__locked">{lockedLabel}</p> : null}
      {cta ? (
        <span className="ui-btn ui-btn--on-band ui-btn--md stay-tile__cta" aria-hidden="true">
          {cta}
          <Icon name="arrow-right" size={18} />
        </span>
      ) : null}
      {children}
    </div>
  );
}
