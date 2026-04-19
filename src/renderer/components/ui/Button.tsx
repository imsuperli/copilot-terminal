import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = 'px-4 py-2 rounded-button font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset disabled:cursor-not-allowed disabled:opacity-60';

  const variantStyles = {
    primary: 'bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] hover:opacity-90 focus:ring-[rgb(var(--ring))]',
    secondary: 'border border-border-subtle bg-[color-mix(in_srgb,rgb(var(--secondary))_78%,transparent)] text-text-primary hover:border-[rgb(var(--ring))] hover:bg-bg-card-hover focus:ring-[rgb(var(--ring))]',
    ghost: 'text-text-primary hover:bg-bg-card-hover focus:ring-[rgb(var(--ring))]',
  };

  return (
    <button
      type="button"
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
