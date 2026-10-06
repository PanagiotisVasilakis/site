import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons/Icon';
import { Surface } from './Surface';

interface EmptyPanelProps {
  title?: ReactNode;
  children?: ReactNode;
  /** `panel` is the identity §8 EmptyPanel (icon, title, text, one action); `surface` is the admin's card. */
  variant?: 'surface' | 'panel';
  icon?: IconName;
  action?: ReactNode;
}

export function EmptyPanel({ title, children, variant = 'surface', icon, action }: EmptyPanelProps) {
  if (variant === 'panel') {
    return (
      <div className="ui-empty">
        {icon ? <span className="ui-empty__icon" aria-hidden><Icon name={icon} size={28} /></span> : null}
        {title ? <h2 className="ui-empty__title">{title}</h2> : null}
        {children ? <p className="ui-empty__text">{children}</p> : null}
        {action ? <div className="ui-empty__action">{action}</div> : null}
      </div>
    );
  }
  return (
    <Surface padding="xl" radius="md" shadow="sm" className="text-center">
      {title ? <h2 className="font-display text-2xl font-semibold italic admin-title">{title}</h2> : null}
      {children ? <div className={title ? 'mt-2 text-sm admin-muted' : 'text-sm admin-muted'}>{children}</div> : null}
    </Surface>
  );
}
