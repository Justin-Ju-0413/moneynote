import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ArrowUpRight, ArrowDownRight, Minus, GitCompareArrows } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ChartTooltip } from '@/components/stats/ChartTooltip'
import type { MonthCompareData } from '@/db/repos/stats'
import dayjs from 'dayjs'

interface MonthCompareChartProps {
  /** 当前查看月（'YYYY-MM'），本月/上月/去年同月标签由此推导 */
  monthKey: string
  /** null 表示查询中（隐藏整卡） */
  data: MonthCompareData | null
}

/** 变化率标注：涨 → danger（支出变多），跌 → income（支出变少），持平 → muted */
function DeltaPill({ label, pct }: { label: string; pct: number | null }) {
  if (pct === null) return null
  const tone =
    pct > 0
      ? 'bg-danger/10 text-danger'
      : pct < 0
        ? 'bg-income/10 text-income'
        : 'bg-primary-50 text-text-muted'
  const text = `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums ${tone}`}>
      {pct > 0 ? (
        <ArrowUpRight size={11} strokeWidth={2} />
      ) : pct < 0 ? (
        <ArrowDownRight size={11} strokeWidth={2} />
      ) : (
        <Minus size={11} strokeWidth={2} />
      )}
      {label} {text}
    </span>
  )
}

/** 月度支出对比：本月 vs 上月（环比），去年同月有数据时追加同比柱 */
export function MonthCompareChart({ monthKey, data }: MonthCompareChartProps) {
  // 查询中隐藏整卡，避免占位闪烁
  if (!data) return null

  const current = dayjs(`${monthKey}-01`)
  const prev = current.subtract(1, 'month')
  const lastYear = current.subtract(1, 'year')

  const bars = [
    {
      key: 'previous',
      label: prev.year() === current.year() ? prev.format('M月') : prev.format('YYYY年M月'),
      amount: data.previous,
      color: 'var(--color-text-muted)',
    },
    {
      key: 'current',
      label: current.format('M月'),
      amount: data.current,
      color: 'var(--color-primary-600)',
    },
  ]
  // 去年同月存在任意交易才展示同比柱（值可能为 0）
  if (data.hasLastYearData) {
    bars.unshift({
      key: 'lastYear',
      label: lastYear.format('YYYY年M月'),
      amount: data.lastYear,
      color: 'var(--color-primary-300)',
    })
  }

  const hasAnyData =
    data.current > 0 || data.previous > 0 || (data.hasLastYearData && data.lastYear > 0)

  if (!hasAnyData) {
    return (
      <Card>
        <EmptyState
          icon={<GitCompareArrows size={22} strokeWidth={1.75} />}
          title="暂无对比数据"
          description="本月和上月都还没有支出记录"
        />
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-xs font-medium text-accent">月度对比</h3>
        <div className="flex flex-wrap items-center gap-1.5 justify-end">
          <DeltaPill label="较上月" pct={data.momPct} />
          <DeltaPill label="较去年" pct={data.yoyPct} />
          {!data.hasPreviousData && (
            <span className="text-[10px] text-text-placeholder">上月无记录</span>
          )}
        </div>
      </div>
      <div className="h-40 md:h-48">
        <ResponsiveContainer width="100%" height="100%">
          {/* 轴/柱色读主题 CSS 变量，跟随亮暗模式 */}
          <BarChart data={bars} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'var(--color-text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: 'var(--color-primary-50)' }}
            />
            <Bar dataKey="amount" name="支出" radius={[6, 6, 0, 0]} barSize={36}>
              {bars.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
