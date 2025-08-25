import React from 'react';

type Common = { variant?: 'primary' | 'secondary' | 'outline'; asChild?: boolean; className?: string };
type ButtonProps = Common & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function CTAButton({ variant='primary', className='', asChild=false, ...rest }: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded px-4 py-3 text-base sm:text-sm font-medium transition-colors focus:outline-none';
  const styles: Record<string,string> = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700',
    secondary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    outline: 'border border-teal-300 text-teal-800 bg-white/70 hover:bg-white'
  };
  if (asChild) {
    // Expect caller to pass an <a> as children; clone to inject className
    const child = (rest as unknown as { children?: React.ReactElement<{ className?: string }> }).children;
    if (!child) return null;
    const childProps = child.props as { className?: string; children?: React.ReactNode };
    const inner = childProps.children;
    const combinedClass = `${base} ${styles[variant]} ${childProps.className || ''} ${className}`.trim();
    return React.cloneElement(child, { ...childProps, className: combinedClass }, inner);
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...rest} />;
}
