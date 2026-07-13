import { PageHeader } from '@/components/layout/PageHeader'
import { PeriodSwitcher } from '@/components/stats/PeriodSwitcher'
import { CategoryPieChart } from '@/components/stats/CategoryPieChart'
import { TrendLineChart } from '@/components/stats/TrendLineChart'
import { Card } from '@/components/ui/Card'
import { useStats } from '@/hooks/useStats'

export function StatsPage() {
  const { period, setPeriod, periodLabel, navigateDate, stats, dateRange } = useStats()

  return (
    <div>
      <PageHeader title="统计" subtitle="查看消费趋势" />
      <div className="px-5 space-y-5 md:px-8 md:space-y-6 lg:px-10 lg:space-y-8">
        <PeriodSwitcher
          period={period}
          onChange={setPeriod}
          label={periodLabel}
          onPrev={() => navigateDate(-1)}
          onNext={() => navigateDate(1)}
        />

        <Card>
          <div className="text-center">
            <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2">总支出</p>
            <p className="text-3xl md:text-4xl lg:text-5xl font-heading text-expense">¥{stats.totalExpense.toFixed(2)}</p>
            <p className="text-[10px] font-mono text-text-muted mt-1">{stats.count} 笔记录</p>
          </div>
        </Card>

        <div className="md:grid md:grid-cols-2 md:gap-5 lg:gap-6">
          <CategoryPieChart data={stats.byCategory} total={stats.totalExpense} />
          <TrendLineChart data={stats.byDate} dateRange={dateRange} />
        </div>
      </div>
    </div>
  )
}
