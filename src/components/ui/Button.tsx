import type { ReactNode, ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const variants = {
  primary: 'bg-primary-600 text-bg hover:bg-primary-700 active:bg-primary-800',
  secondary: 'border border-primary-400 text-primary-600 hover:bg-primary-50',
  ghost: 'text-primary-600 hover:bg-primary-50/50',
  danger: 'border border-[#c94040]/40 text-[#c94040] hover:bg-[#c94040]/5',
}

const sizes = {
  sm: 'px-3 py-1.5 text-[11px] tracking-widest uppercase min-h-9',
  md: 'px-5 py-2.5 text-xs tracking-widest uppercase min-h-11',
  lg: 'px-6 py-3 text-sm tracking-widest uppercase min-h-12',
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
      className={`font-medium transition-colors ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
