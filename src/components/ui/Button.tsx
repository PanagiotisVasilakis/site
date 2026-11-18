import React from 'react';
import clsx from 'clsx';

/** identity §8 Button (styles in src/styles/components/ui.css); `variant` defaults to primary. */
const BUTTON_VARIANTS = {
  primary: 'ui-btn--primary',
  secondary: 'ui-btn--secondary',
  ghost: 'ui-btn--ghost',
  glass: 'ui-btn--glass',
  'on-band': 'ui-btn--on-band',
  'link-arrow': 'ui-btn--link-arrow',
} as const;

const BUTTON_SIZES = {
  sm: 'ui-btn--sm',
  md: 'ui-btn--md',
  lg: 'ui-btn--lg',
} as const;

type StyleProps = {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  block?: boolean;
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & StyleProps & {
  asChild?: false;
};

type ButtonAsChildProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & StyleProps & {
  asChild: true;
  children: React.ReactElement<{ className?: string }>;
};

type AppButtonProps = ButtonProps | ButtonAsChildProps;

export function Button({ className, asChild, variant = 'primary', size = 'md', block, ...props }: AppButtonProps) {
  const classes = clsx(
    'ui-btn',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    block && 'ui-btn--block',
    className,
  );

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
