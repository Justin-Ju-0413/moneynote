import { useEffect, useState } from 'react'
import { listUsageBetween, cleanupLLMUsage } from '@/llm/usage'
import dayjs from 'dayjs'

// LLM 用量展示（C3 成本可观测）：本月调用次数 + token 消耗
// 挂载时惰性清理 90 天前的用量记录
export function LLMUsage() {
  const [usage, setUsage] = useState<{ calls: number; promptTokens: number; completionTokens: number; totalTokens: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await cleanupLLMUsage(90)
      const start = dayjs().startOf('month').valueOf()
      const end = dayjs().endOf('month').valueOf()
      const rows = await listUsageBetween(start, end)
      if (cancelled) return
      setUsage({
        calls: rows.length,
        promptTokens: rows.reduce((s, r) => s + r.promptTokens, 0),
        completionTokens: rows.reduce((s, r) => s + r.completionTokens, 0),
        totalTokens: rows.reduce((s, r) => s + r.totalTokens, 0),
      })
    })()
    return () => { cancelled = true }
  }, [])

  if (!usage || usage.calls === 0) {
    return (
      <p className="text-[10px] text-text-placeholder mt-3">本月暂无 LLM 调用记录（用量仅记录在本地）</p>
    )
  }

  return (
    <div className="mt-3 space-y-1 border-t border-primary-200/30 pt-3">
      <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted">本月 LLM 用量</p>
      <p className="text-[10px] text-text">
        {usage.calls} 次调用 · 输入 {usage.promptTokens.toLocaleString()} tokens · 输出 {usage.completionTokens.toLocaleString()} tokens · 合计 {usage.totalTokens.toLocaleString()}
      </p>
      <p className="text-[10px] text-text-placeholder">用量仅存储在本地浏览器</p>
    </div>
  )
}
