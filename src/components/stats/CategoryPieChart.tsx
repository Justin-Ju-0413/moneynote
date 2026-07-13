import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Card } from '@/components/ui/Card'
import { CATEGORY_MAP } from '@/utils/constants'

interface CategoryPieChartProps {
  data: Record<string, number>
  total: number
}

export function CategoryPieChart({ data, total }: CategoryPieChartProps) {
  const chartData = Object.entries(data)
    .map(([category, amount]) => ({
      name: CATEGORY_MAP[category]?.name || category,
      value: amount,
      color: CATEGORY_MAP[category]?.color || '#6b7b8d',
      icon: CATEGORY_MAP[category]?.icon || '📦',
    }))
    .sort((a, b) => b.value - a.value)

  if (chartData.length === 0) {
    return (
      <Card className="text-center py-8">
        <p className="text-text-muted text-xs">暂无数据</p>
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium mb-3">分类占比</h3>
      <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
        <div className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius="45%" outerRadius="85%" dataKey="value" strokeWidth={0}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [`¥${Number(value).toFixed(2)}`, '']}
                contentStyle={{ borderRadius: 2, border: '1px solid rgba(14,84,166,0.2)', background: '#f0f4f8', fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {chartData.slice(0, 5).map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <span className="text-sm">{item.icon}</span>
              <span className="text-[11px] text-text-secondary flex-1">{item.name}</span>
              <span className="text-[11px] font-heading text-text">¥{item.value.toFixed(0)}</span>
              <span className="text-[10px] font-mono text-text-muted">{total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
