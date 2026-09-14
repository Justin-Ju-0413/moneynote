import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { PieChart as PieChartIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ChartTooltip } from '@/components/stats/ChartTooltip'
import { useCategories } from '@/hooks/useCategories'

interface CategoryPieChartProps {
  data: Record<string, number>
  total: number
}

export function CategoryPieChart({ data, total }: CategoryPieChartProps) {
  const { getInfo } = useCategories()
  const chartData = Object.entries(data)
    .map(([category, amount]) => {
      const info = getInfo(category)
      return { name: info.name, value: amount, color: info.color }
    })
    .sort((a, b) => b.value - a.value)

  if (chartData.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<PieChartIcon size={22} strokeWidth={1.75} />}
          title="暂无分类数据"
          description="记一笔支出后，这里会展示各分类占比"
        />
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="text-xs font-medium text-accent mb-3">分类占比</h3>
      <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
        <div className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius="45%" outerRadius="85%" dataKey="value" strokeWidth={0}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 w-full space-y-2.5">
          {chartData.slice(0, 5).map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[11px] text-text-secondary flex-1">{item.name}</span>
              <span className="text-[11px] font-heading tabular-nums text-text">¥{item.value.toFixed(0)}</span>
              <span className="text-[10px] font-mono text-text-muted w-9 text-right">
                {total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
