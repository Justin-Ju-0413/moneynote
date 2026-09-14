import type { ReactNode, ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const variants = {
  primary: 'bg-primary-600 text-bg hover:bg-primary-700 active:bg-primary-800',
  secondary: 'border border-primary-400 text-accent hover:bg-primary-50 active:bg-primary-100/60',
  ghost: 'text-accent hover:bg-primary-50/50',
  danger: 'border border-danger/40 text-danger hover:bg-danger/5 active:bg-danger/10',
}

const sizes = {
  sm: 'px-3.5 py-1.5 text-xs min-h-9',
  md: 'px-5 py-2.5 text-sm min-h-11',
  lg: 'px-6 py-3 text-sm min-h-12',
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-button font-medium transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
