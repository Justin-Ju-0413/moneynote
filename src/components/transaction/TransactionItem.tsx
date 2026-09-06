import type { Transaction } from '@/db/types'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { useCategories } from '@/hooks/useCategories'
import { formatAmountSigned } from '@/utils/format'

interface TransactionItemProps {
  transaction: Transaction
  onClick?: () => void
}

export function TransactionItem({ transaction, onClick }: TransactionItemProps) {
  const { getInfo } = useCategories()
  const info = getInfo(transaction.category)
  const isExpense = transaction.type === 'expense'

  return (
    <div
      className="flex items-center gap-3 py-3 md:py-4 min-h-11 active:bg-primary-50/20 cursor-pointer"
      onClick={onClick}
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
      <span className={`text-sm md:text-base font-heading ${isExpense ? 'text-expense' : 'text-income'}`}>
        {formatAmountSigned(transaction.amount, transaction.type)}
      </span>
    </div>
  )
}
