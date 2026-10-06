import type React from 'react';
import clsx from 'clsx';

import { Icon } from '@/components/icons/Icon';

const ICONS = { info: 'info', warning: 'alert' } as const;

type CalloutProps = {
  variant: keyof typeof ICONS;
  /** `status` for live notes (polite); static notes need no role. */
  role?: 'status';
  hidden?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * identity §8 Callout: an icon and a note on the `info-bg` / `warning-bg` tokens (styles in
 * src/styles/components/ui.css). The `success` and `danger` variants arrive with their first consumer.
 */
export function Callout({ variant, role, hidden, className, children }: CalloutProps) {
  return (
    <div role={role} hidden={hidden} className={clsx('ui-callout', `ui-callout--${variant}`, className)}>
      <Icon name={ICONS[variant]} className="ui-callout__icon" size={20} />
      <div className="ui-callout__body">{children}</div>
    </div>
  );
}
