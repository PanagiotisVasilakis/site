import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

const BADGE_VARIANTS = {
  warning: 'status-badge--pending',
  pending: 'status-badge--pending',
  approved: 'status-badge--approved',
  rejected: 'status-badge--rejected',
} as const;

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof BADGE_VARIANTS;
};

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={clsx('status-badge', variant && BADGE_VARIANTS[variant], className)} {...props} />;
}
