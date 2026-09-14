import type { Transaction } from '@/db/types'
import { TransactionItem } from './TransactionItem'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/utils/format'

interface TransactionListProps {
  transactions: Transaction[]
  onItemClick?: (transaction: Transaction) => void
  showDate?: boolean
}

export function TransactionList({ transactions, onItemClick, showDate = true }: TransactionListProps) {
  if (transactions.length === 0) {
    return <EmptyState title="暂无记录" description="输入自然语言快速记账吧" />
  }

  // 按日期分组
  const grouped = transactions.reduce<Record<string, Transaction[]>>((acc, t) => {
    const key = t.date
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-5">
      {sortedDates.map((date) => (
        <div key={date}>
          {showDate && (
            <div className="flex items-center gap-3 mb-2 px-1">
              <span className="text-[11px] font-medium text-text-muted">{formatDate(date)}</span>
              <div className="flex-1 h-px bg-primary-200/30" />
              <span className="text-[10px] font-mono tabular-nums text-text-muted">
                ¥{grouped[date].reduce((s, t) => s + (t.type === 'expense' ? t.amount : 0), 0).toFixed(0)}
              </span>
            </div>
          )}
          {/* 日组圆角卡片（与预算页 Card 同 token），行内分隔线统一 */}
          <div className="rounded-card shadow-card blue-border bg-bg overflow-hidden divide-y divide-primary-200/30">
            {grouped[date].map((t) => (
              <TransactionItem key={t.id} transaction={t} onClick={() => onItemClick?.(t)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
