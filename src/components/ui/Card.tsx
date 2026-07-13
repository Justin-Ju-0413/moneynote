import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      className={`blue-border bg-bg p-4 md:p-5 lg:p-6 ${onClick ? 'cursor-pointer hover:bg-primary-50/30' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
