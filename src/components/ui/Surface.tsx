import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const surfaceVariants = cva('', {
  variants: {
    variant: {
      card: 'surface-card',
    },
    padding: {
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-6',
      xl: 'p-8',
    },
    radius: {
      md: 'rounded-lg',
      lg: 'rounded-xl',
    },
    shadow: {
      sm: 'shadow-sm',
      lg: 'shadow-lg',
    },
    border: {
      none: '',
      soft: 'border border-soft',
    },
  },
  defaultVariants: {
    variant: 'card',
    padding: 'md',
    radius: 'md',
    shadow: 'sm',
    border: 'soft',
  },
});

type SurfaceProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof surfaceVariants>;

export function Surface({ className, variant, padding, radius, shadow, border, ...props }: SurfaceProps) {
  return (
    <div
      className={surfaceVariants({ variant, padding, radius, shadow, border, className })}
      {...props}
    />
  );
}
