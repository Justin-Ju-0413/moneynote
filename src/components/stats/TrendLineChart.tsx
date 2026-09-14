import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ChartTooltip } from '@/components/stats/ChartTooltip'
import dayjs from 'dayjs'

interface TrendLineChartProps {
  data: Record<string, number>
  dateRange: [string, string]
}

export function TrendLineChart({ data, dateRange }: TrendLineChartProps) {
  const start = dayjs(dateRange[0])
  const end = dayjs(dateRange[1])
  const days = end.diff(start, 'day') + 1

  const chartData = Array.from({ length: days }, (_, i) => {
    const date = start.add(i, 'day').format('YYYY-MM-DD')
    return {
      date: dayjs(date).format('M/D'),
      amount: data[date] || 0,
    }
  })

  if (chartData.every(d => d.amount === 0)) {
    return (
      <Card>
        <EmptyState
          icon={<BarChart3 size={22} strokeWidth={1.75} />}
          title="暂无趋势数据"
          description="该时间段还没有支出记录"
        />
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="text-xs font-medium text-accent mb-3">支出趋势</h3>
      <div className="h-40 md:h-52 lg:h-64">
        <ResponsiveContainer width="100%" height="100%">
          {/* 轴/线条/浮层用主题 CSS 变量，跟随亮暗模式 */}
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: 'var(--color-border-blue)', strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="amount"
              name="支出"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ r: 2, fill: 'var(--color-accent)' }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
