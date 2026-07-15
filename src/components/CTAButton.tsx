import React from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'outline' | 'tint' | 'danger' | 'ghost';
type Common = { variant?: Variant; className?: string };
type NativeButtonProps = Common & React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: false };
type AsChildProps = Common & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
  asChild: true;
  children: React.ReactElement<{ className?: string }>;
};
type CTAButtonProps = NativeButtonProps | AsChildProps;

export function CTAButton({ variant='primary', className='', asChild=false, ...rest }: CTAButtonProps) {
  const base = 'focus:outline-none';
  const styles: Record<string,string> = {
    primary: 'btn-primary',
    secondary: 'btn-accent',
    outline: 'btn-outline',
    tint: 'btn-tint',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  };
  if (asChild) {
    const { children: child, ...anchorProps } = rest as Omit<AsChildProps, keyof Common | 'asChild'>;
    if (!child || !React.isValidElement(child)) return null;
    return React.cloneElement(child, {
      ...anchorProps,
      className: clsx(base, styles[variant], child.props.className, className),
    });
  }
  return <button className={clsx(base, styles[variant], className)} {...(rest as NativeButtonProps)} />;
}
