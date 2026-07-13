import { formatAmountShort } from '@/utils/format'

interface StatsSummaryProps {
  todayExpense: number
  monthExpense: number
}

export function StatsSummary({ todayExpense, monthExpense }: StatsSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-px bg-primary-200/30">
      <div className="bg-bg p-4 md:p-6 text-center">
        <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5">今日支出</p>
        <p className="text-xl md:text-2xl lg:text-3xl font-heading text-expense">{formatAmountShort(todayExpense)}</p>
      </div>
      <div className="bg-bg p-4 md:p-6 text-center">
        <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5">本月支出</p>
        <p className="text-xl md:text-2xl lg:text-3xl font-heading text-expense">{formatAmountShort(monthExpense)}</p>
      </div>
    </div>
  )
}
