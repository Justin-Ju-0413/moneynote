import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  /** 装饰图标：ReactNode（推荐 lucide 组件）；传字符串则按文本渲染（兼容旧调用） */
  icon?: ReactNode
  title: string
  description?: string
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
      <div className="w-12 h-12 rounded-card bg-primary-50 flex items-center justify-center text-primary-400 mb-4">
        {icon ?? <Inbox size={22} strokeWidth={1.75} />}
      </div>
      <h3 className="font-heading text-sm text-text mb-1">{title}</h3>
      {description && <p className="text-text-muted text-xs mt-1 leading-relaxed max-w-xs">{description}</p>}
    </div>
  )
}
