import type { ReactNode } from 'react'

interface ChipProps {
  active: boolean
  onClick: () => void
  children: ReactNode
  /** sm：紧凑行内；touch：移动端筛选栏，44px 触摸高度 */
  size?: 'sm' | 'touch'
  className?: string
}

const sizes = {
  sm: 'px-3 py-1.5',
  touch: 'px-3 py-2.5 min-h-11',
}

/** 统一筛选/选择 chip：选中实底、未选中描边，hover 双反馈 */
export function Chip({ active, onClick, children, size = 'sm', className = '' }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${sizes[size]} text-[10px] tracking-widest uppercase font-medium whitespace-nowrap transition-colors ${
        active
          ? 'bg-primary-600 text-bg'
          : 'border border-primary-300/50 text-text-muted hover:text-primary-600 hover:bg-primary-50/40'
      } ${className}`}
    >
      {children}
    </button>
  )
}
