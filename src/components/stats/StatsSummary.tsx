import { formatAmountShort } from '@/utils/format'

interface StatsSummaryProps {
  todayExpense: number
  monthExpense: number
}

export function StatsSummary({ todayExpense, monthExpense }: StatsSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-card shadow-card blue-border bg-bg p-4 md:p-6 text-center">
        <p className="text-[11px] text-text-muted mb-1.5">今日支出</p>
        <p className="text-xl md:text-2xl lg:text-3xl font-heading tabular-nums text-expense">{formatAmountShort(todayExpense)}</p>
      </div>
      <div className="rounded-card shadow-card blue-border bg-bg p-4 md:p-6 text-center">
        <p className="text-[11px] text-text-muted mb-1.5">本月支出</p>
        <p className="text-xl md:text-2xl lg:text-3xl font-heading tabular-nums text-expense">{formatAmountShort(monthExpense)}</p>
      </div>
    </div>
  )
}
