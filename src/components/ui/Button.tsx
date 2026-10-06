import React from 'react';
import clsx from 'clsx';
import { cva, type VariantProps } from 'class-variance-authority';

/** identity §8 Button (styles in src/styles/components/ui.css); `variant` defaults to primary. */
const buttonVariants = cva('ui-btn', {
  variants: {
    variant: {
      primary: 'ui-btn--primary',
      secondary: 'ui-btn--secondary',
      ghost: 'ui-btn--ghost',
      glass: 'ui-btn--glass',
      'on-band': 'ui-btn--on-band',
      'outline-on-band': 'ui-btn--outline-on-band',
      'link-arrow': 'ui-btn--link-arrow',
    },
    size: {
      sm: 'ui-btn--sm',
      md: 'ui-btn--md',
      lg: 'ui-btn--lg',
    },
    block: {
      true: 'ui-btn--block',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

type StyleProps = {
  variant?: NonNullable<ButtonVariantProps['variant']>;
  size?: NonNullable<ButtonVariantProps['size']>;
  block?: boolean;
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & StyleProps & {
  asChild?: false;
};

type ButtonAsChildProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & StyleProps & {
  asChild: true;
  children: React.ReactElement<{ className?: string }>;
};

export type AppButtonProps = ButtonProps | ButtonAsChildProps;

export function Button({ className, asChild, variant, size, block, ...props }: AppButtonProps) {
  const classes = clsx(buttonVariants({ variant, size, block }), className);

  if (asChild) {
    const { children, ...anchorProps } = props as Omit<ButtonAsChildProps, 'asChild'>;
    if (!React.isValidElement(children)) return null;
    return React.cloneElement(children, {
      ...anchorProps,
      className: clsx(classes, children.props.className),
    });
  }

  return <button className={classes} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)} />;
}
