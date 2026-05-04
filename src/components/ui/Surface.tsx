import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const surfaceVariants = cva('', {
  variants: {
    variant: {
      card: 'surface-card',
      panel: 'surface-panel',
      subtle: 'surface-subtle',
      interactive: 'surface-interactive',
    },
    padding: {
      none: '',
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-6',
      xl: 'p-8',
    },
    radius: {
      inherit: '',
      md: 'rounded-lg',
      lg: 'rounded-xl',
      xl: 'rounded-2xl',
    },
    shadow: {
      none: '',
      sm: 'shadow-sm',
      md: 'shadow',
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
