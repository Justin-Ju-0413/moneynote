import { useMemo, useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Transaction } from '@/db/types'
import { TransactionItem, TRANSACTION_ITEM_HEIGHT } from './TransactionItem'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/utils/format'

/** 行高常量：分组头 36px / 条目 64px（实测单行备注 + 时间两行内容 < 64px，含触控余量） */
const HEADER_HEIGHT = 36
const OVERSCAN = 8

interface TransactionListProps {
  transactions: Transaction[]
  onItemClick?: (transaction: Transaction) => void
  showDate?: boolean
  /** 挂在虚拟列表之后的滚动容器内（明细页触底加载哨兵用） */
  footer?: ReactNode
}

/** 扁平化虚拟行：分组头（含当日支出小计）+ 条目（带组内首/末标记，用于拼接卡片边框） */
type VirtualRow =
  | { kind: 'header'; key: string; date: string; expenseTotal: number }
  | { kind: 'item'; key: string; tx: Transaction; first: boolean; last: boolean }

export function TransactionList({ transactions, onItemClick, showDate = true, footer }: TransactionListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo<VirtualRow[]>(() => {
    // 按日期分组（保持传入顺序，明细页已按 date 降序）
    const grouped = transactions.reduce<Record<string, Transaction[]>>((acc, t) => {
      ;(acc[t.date] ??= []).push(t)
      return acc
    }, {})
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

    const out: VirtualRow[] = []
    for (const date of sortedDates) {
      const items = grouped[date]
      if (showDate) {
        out.push({
          kind: 'header',
          key: `h-${date}`,
          date,
          expenseTotal: items.reduce((s, t) => s + (t.type === 'expense' ? t.amount : 0), 0),
        })
      }
      items.forEach((tx, i) => {
        out.push({
          kind: 'item',
          key: tx.id != null ? `t-${tx.id}` : `t-${date}-${i}`,
          tx,
          first: i === 0,
          last: i === items.length - 1,
        })
      })
    }
    return out
  }, [transactions, showDate])

  // TanStack Virtual 返回含可变函数的实例，React Compiler 会跳过本组件记忆化（安全降级，仅损失优化不损失正确性）
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === 'header' ? HEADER_HEIGHT : TRANSACTION_ITEM_HEIGHT),
    overscan: OVERSCAN,
    getItemKey: (index) => rows[index]?.key ?? String(index),
  })

  if (transactions.length === 0) {
    return <EmptyState title="暂无记录" description="输入自然语言快速记账吧" />
  }

  return (
    // 滚动容器高度自适应：内容不足时随内容增长（无内滚），超过视口余量后内部滚动
    <div
      ref={scrollRef}
      className="overflow-y-auto overscroll-contain"
      style={{ maxHeight: 'calc(100dvh - 432px)', minHeight: '320px' }}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index]
          return (
            <div
              key={vi.key}
              className="absolute left-0 right-0 top-0"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              {row.kind === 'header' ? (
                <div className="flex items-center gap-3 px-1" style={{ height: HEADER_HEIGHT }}>
                  <span className="text-[11px] font-medium text-text-muted">{formatDate(row.date)}</span>
                  <div className="flex-1 h-px bg-primary-200/30" />
                  <span className="text-[10px] font-mono tabular-nums text-text-muted">
                    ¥{row.expenseTotal.toFixed(0)}
                  </span>
                </div>
              ) : (
                <TransactionItem
                  transaction={row.tx}
                  onClick={() => onItemClick?.(row.tx)}
                  groupPosition={{ first: row.first, last: row.last }}
                />
              )}
            </div>
          )
        })}
      </div>
      {footer}
    </div>
  )
}
