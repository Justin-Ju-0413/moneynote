import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card } from '@/components/ui/Card'
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
      <Card className="text-center py-8">
        <p className="text-text-muted text-xs">暂无趋势数据</p>
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium mb-3">支出趋势</h3>
      <div className="h-40 md:h-52 lg:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7b8d' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#6b7b8d' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              formatter={(value) => [`¥${Number(value).toFixed(2)}`, '支出']}
              contentStyle={{ borderRadius: 2, border: '1px solid rgba(14,84,166,0.2)', background: '#f0f4f8', fontSize: 11 }}
            />
            <Line type="monotone" dataKey="amount" stroke="#0c4a94" strokeWidth={2} dot={{ r: 2, fill: '#0c4a94' }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
