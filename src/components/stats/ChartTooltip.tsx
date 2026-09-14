import type { ReactNode } from 'react'

/** recharts Tooltip payload 单项（只取渲染需要的字段，兼容 recharts 2/3 注入结构） */
interface TooltipEntry {
  name?: unknown
  value?: unknown
  color?: string
  payload?: { fill?: string; color?: string }
}

export interface ChartTooltipProps {
  /** recharts <Tooltip content> 注入：是否悬浮命中 */
  active?: boolean
  /** recharts 注入的数据项 */
  payload?: TooltipEntry[]
  /** 轴标签（折线图为 X 轴值；饼图无） */
  label?: unknown
  /** 数值格式化，默认保留两位小数并加 ¥ 前缀 */
  formatValue?: (value: number) => string
  /** 头部额外内容（如分类名），label 存在时渲染在其后 */
  extra?: ReactNode
}

/**
 * 统一图表浮层：颜色读主题 CSS 变量，亮暗模式自动跟随。
 * 用法：<Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border-blue)' }} />
 */
export function ChartTooltip({ active, payload, label, formatValue, extra }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const fmt = formatValue ?? ((v: number) => `¥${v.toFixed(2)}`)
  const labelStr = label === undefined || label === '' ? null : String(label)

  return (
    <div
      className="rounded-button shadow-elevated px-3 py-2 text-[11px] max-w-[220px]"
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border-blue)',
        color: 'var(--color-text)',
      }}
    >
      {(labelStr !== null || extra) && (
        <p className="font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
          {labelStr}
          {extra}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: entry.color ?? entry.payload?.fill ?? entry.payload?.color ?? 'var(--color-accent)' }}
            />
            <span className="mr-auto" style={{ color: 'var(--color-text-muted)' }}>
              {String(entry.name ?? '')}
            </span>
            <span className="font-mono tabular-nums" style={{ color: 'var(--color-text)' }}>
              {fmt(Number(entry.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
