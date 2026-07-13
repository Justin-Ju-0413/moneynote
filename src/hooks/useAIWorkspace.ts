import { useCallback, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useLLMSettings } from './useLLMSettings'
import { runLLMAudit } from '@/llm/service'
import type { AuditTask, AiSuggestion } from '@/llm/types'

// AI 工作台 hook：统一承载 audit / categorize / dedupe / analyzeMonth 四类任务
export function useAIWorkspace() {
  const { config } = useLLMSettings()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTask, setLastTask] = useState<AuditTask | null>(null)
  const [lastCount, setLastCount] = useState(0)

  // 待审核建议（按时间倒序）
  const pendingSuggestions = (useLiveQuery(
    () => db.aiSuggestions.where('status').equals('pending').reverse().sortBy('createdAt'),
  ) ?? []) as AiSuggestion[]

  const runTask = useCallback(async (task: AuditTask) => {
    if (!config) return
    setRunning(true)
    setError(null)
    setLastTask(task)
    setLastCount(0)
    try {
      let txs = await db.transactions.toArray()
      // 月度摘要只看本月
      if (task === 'analyzeMonth') {
        const now = new Date()
        const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        txs = txs.filter((t) => t.date.startsWith(prefix))
      }
      if (txs.length === 0) {
        setError('没有可分析的流水')
        setRunning(false)
        return
      }

      const { suggestions, error: err } = await runLLMAudit(config, txs, task)
      if (suggestions.length > 0) {
        await db.aiSuggestions.bulkAdd(suggestions)
        setLastCount(suggestions.length)
      } else if (err) {
        setError(err)
      } else {
        setError('AI 未发现可建议的内容')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '运行失败')
    }
    setRunning(false)
  }, [config])

  // 应用建议：category 改分类；duplicate 保留首笔删除其余；anomaly/summary 仅标记已处理
  const applySuggestion = useCallback(async (suggestion: AiSuggestion) => {
    if (suggestion.id === undefined) return

    if (suggestion.type === 'category' && suggestion.transactionIds.length > 0) {
      await db.transactions.update(suggestion.transactionIds[0], {
        category: suggestion.result,
        updatedAt: Date.now(),
      })
    } else if (suggestion.type === 'duplicate' && suggestion.transactionIds.length > 1) {
      const [, ...rest] = suggestion.transactionIds
      await db.transactions.bulkDelete(rest)
    }

    await db.aiSuggestions.update(suggestion.id, { status: 'accepted' })
  }, [])

  const dismissSuggestion = useCallback(async (id: number) => {
    await db.aiSuggestions.update(id, { status: 'dismissed' })
  }, [])

  const clearAll = useCallback(async () => {
    await db.aiSuggestions.clear()
    setError(null)
    setLastCount(0)
  }, [])

  return {
    pendingSuggestions,
    running,
    error,
    lastTask,
    lastCount,
    runTask,
    applySuggestion,
    dismissSuggestion,
    clearAll,
    hasApiKey: !!config?.apiKey && !!config?.endpoint && !!config?.model,
    privacyMode: config?.privacyMode ?? true,
  }
}
