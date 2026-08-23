'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-brand-900 hover:bg-brand-800 text-white',
  secondary: 'bg-white hover:bg-brand-50 text-brand-900 border border-brand-200',
  ghost: 'bg-brand-100 hover:bg-brand-200 text-brand-900',
  danger: 'text-red-500 hover:text-red-700 hover:bg-red-50',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1',
  md: 'text-sm px-4 py-2',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[background-color,color,transform,box-shadow] duration-150 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  )
);
Button.displayName = 'Button';

export default Button;
