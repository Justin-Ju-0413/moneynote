import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      className={`rounded-card shadow-card blue-border bg-bg p-4 md:p-5 lg:p-6 transition-colors ${onClick ? 'cursor-pointer hover:bg-primary-50/30 active:bg-primary-50/60' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
