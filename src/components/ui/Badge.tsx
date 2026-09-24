import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva('status-badge', {
  variants: {
    variant: {
      warning: 'status-badge--pending',
      pending: 'status-badge--pending',
      approved: 'status-badge--approved',
      rejected: 'status-badge--rejected',
    },
  },
});

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={badgeVariants({ variant, className })} {...props} />;
}
