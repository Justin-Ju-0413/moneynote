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
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2">支出</p>
              <p className="text-xl md:text-2xl lg:text-3xl font-heading text-expense">¥{stats.totalExpense.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2">收入</p>
              <p className="text-xl md:text-2xl lg:text-3xl font-heading text-income">¥{stats.totalIncome.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2">结余</p>
              <p className="text-xl md:text-2xl lg:text-3xl font-heading text-text">¥{stats.netIncome.toFixed(2)}</p>
            </div>
          </div>
          <p className="text-[10px] font-mono text-text-muted mt-3 text-center">{stats.count} 笔支出 · {stats.incomeCount} 笔收入</p>
        </Card>

        <div className="md:grid md:grid-cols-2 md:gap-5 lg:gap-6">
          <CategoryPieChart data={stats.byCategory} total={stats.totalExpense} />
          <TrendLineChart data={stats.byDate} dateRange={dateRange} />
        </div>
      </div>
    </div>
  )
}
