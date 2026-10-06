import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const surfaceVariants = cva('', {
  variants: {
    variant: {
      card: 'admin-card',
    },
    padding: {
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-6',
      xl: 'p-8',
    },
    radius: {
      md: 'rounded-tile',
      lg: 'rounded-card',
    },
    shadow: {
      sm: 'shadow-sm',
      lg: 'shadow-lg',
    },
  },
  defaultVariants: {
    variant: 'card',
    padding: 'md',
    radius: 'md',
    shadow: 'sm',
  },
});

type SurfaceProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof surfaceVariants>;

export function Surface({ className, variant, padding, radius, shadow, ...props }: SurfaceProps) {
  return (
    <div
      className={surfaceVariants({ variant, padding, radius, shadow, className })}
      {...props}
    />
  );
}
