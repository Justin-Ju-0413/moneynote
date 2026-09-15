import type { CSSProperties } from 'react'
import type { Transaction } from '@/db/types'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { useCategories } from '@/hooks/useCategories'
import { formatAmountSigned } from '@/utils/format'

interface TransactionItemProps {
  transaction: Transaction
  onClick?: () => void
  /** 虚拟化日组卡片定位：行固定 64px，边框/圆角按组内位置拼接成整卡视觉 */
  groupPosition?: { first: boolean; last: boolean }
}

/** 虚拟化行高常量（与 TransactionList 的 estimateSize 保持一致） */
export const TRANSACTION_ITEM_HEIGHT = 64

export function TransactionItem({ transaction, onClick, groupPosition }: TransactionItemProps) {
  const { getInfo } = useCategories()
  const info = getInfo(transaction.category)
  const isExpense = transaction.type === 'expense'

  // 虚拟化模式：固定高度 + 按组内首/末拼接日组卡片（rounded-card 视觉拆到行级）
  const inGroup = groupPosition != null
  const isFirst = groupPosition?.first ?? false
  const isLast = groupPosition?.last ?? false

  const style: CSSProperties = inGroup
    ? {
        height: TRANSACTION_ITEM_HEIGHT,
        // 侧边/首末边用卡片蓝边框；组内分隔线用更柔和的 divider 色（对应原 divide-y）
        borderColor: 'var(--color-border-blue)',
        borderTopColor: isFirst ? 'var(--color-border-blue)' : 'var(--color-border-blue-soft)',
        borderRadius: isFirst && isLast
          ? 'var(--radius-card)'
          : isFirst
            ? 'var(--radius-card) var(--radius-card) 0 0'
            : isLast
              ? '0 0 var(--radius-card) var(--radius-card)'
              : 0,
      }
    : {}

  return (
    <div
      onClick={onClick}
      style={style}
      className={
        inGroup
          ? `flex items-center gap-3 px-3 md:px-4 bg-bg overflow-hidden active:bg-primary-50/20 hover:bg-primary-50/30 transition-colors cursor-pointer border-t border-l border-r ${isLast ? 'border-b shadow-card' : ''}`
          : 'flex items-center gap-3 px-3 md:px-4 py-3 md:py-3.5 min-h-11 rounded-lg active:bg-primary-50/20 hover:bg-primary-50/30 transition-colors cursor-pointer'
      }
    >
      <CategoryIcon category={transaction.category} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="text-sm md:text-base truncate text-text">
          {transaction.note || info.name}
        </div>
        {transaction.time && (
          <div className="text-[10px] text-text-muted mt-0.5 font-mono">{transaction.time}</div>
        )}
      </div>
      <span className={`text-sm md:text-base font-heading tabular-nums ${isExpense ? 'text-expense' : 'text-income'}`}>
        {formatAmountSigned(transaction.amount, transaction.type)}
      </span>
    </div>
  )
}
