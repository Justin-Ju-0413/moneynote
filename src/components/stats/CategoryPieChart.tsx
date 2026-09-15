import { useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { PieChart as PieChartIcon, ChevronDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ChartTooltip } from '@/components/stats/ChartTooltip'
import { useCategories } from '@/hooks/useCategories'

const TOP_N = 5

interface CategoryPieChartProps {
  data: Record<string, number>
  total: number
  /** 上期同口径分类支出（如上月）；缺某分类或无上期数据时不显示环比箭头 */
  previous?: Record<string, number>
}

/** 较上期变化率（%）；上期无该分类支出（含无上期数据）时不显示 */
function MoMDelta({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined || previous <= 0) return null
  const pct = ((current - previous) / previous) * 100
  const tone =
    pct > 0 ? 'text-danger' : pct < 0 ? 'text-income' : 'text-text-muted'
  return (
    <span
      className={`w-11 flex items-center justify-end gap-0.5 text-[10px] font-medium tabular-nums shrink-0 ${tone}`}
      title="较上期"
    >
      {pct > 0 ? (
        <ArrowUpRight size={10} strokeWidth={2} />
      ) : pct < 0 ? (
        <ArrowDownRight size={10} strokeWidth={2} />
      ) : null}
      {pct > 0 ? '+' : ''}
      {pct.toFixed(0)}%
    </span>
  )
}

export function CategoryPieChart({ data, total, previous }: CategoryPieChartProps) {
  const { getInfo } = useCategories()
  const [expanded, setExpanded] = useState(false)
  const chartData = Object.entries(data)
    .map(([category, amount]) => {
      const info = getInfo(category)
      return { id: category, name: info.name, value: amount, color: info.color }
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

  const visible = expanded ? chartData : chartData.slice(0, TOP_N)

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
        <div className="flex-1 w-full">
          {/* 展开时完整列表可滚动（隐藏滚动条），折叠时只显示 Top5 */}
          <div className={`space-y-2.5 ${expanded ? 'max-h-60 overflow-y-auto scrollbar-hide pr-1' : ''}`}>
            {visible.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] text-text-secondary flex-1 truncate">{item.name}</span>
                <MoMDelta current={item.value} previous={previous?.[item.id]} />
                <span className="text-[11px] font-heading tabular-nums text-text">¥{item.value.toFixed(0)}</span>
                <span className="text-[10px] font-mono text-text-muted w-9 text-right shrink-0">
                  {total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
          {chartData.length > TOP_N && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-2.5 flex items-center gap-1 text-[11px] text-primary-500 hover:text-primary-400 transition-colors"
            >
              {expanded ? '收起' : `展开全部 ${chartData.length} 个分类`}
              <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}
