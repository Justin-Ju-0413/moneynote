interface BadgeProps {
  children: React.ReactNode
  color?: string
  className?: string
}

export function Badge({ children, color = '#6b7280', className = '' }: BadgeProps) {
  // 兼容两种色值：hex 直接拼 alpha；CSS 变量（语义 token）走 color-mix 调 tint
  const tint = color.startsWith('var(')
    ? `color-mix(in srgb, ${color} 10%, transparent)`
    : `${color}15`
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${className}`}
      style={{ backgroundColor: tint, color }}
    >
      {children}
    </span>
  )
}
