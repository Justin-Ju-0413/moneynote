import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useLLMSettings } from './useLLMSettings'
import { runLLMAudit } from '@/llm/service'
import { hashKey } from '@/utils/hash'
import type { AuditTask, AiSuggestion } from '@/llm/types'

interface Progress {
  current: number
  total: number
}

// AI 工作台 hook：统一承载 audit / categorize / dedupe / analyzeMonth 四类任务
export function useAIWorkspace() {
  const { config } = useLLMSettings()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCount, setLastCount] = useState(0)
  const [cachedHit, setCachedHit] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [forceRefresh, setForceRefresh] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // 挂载时自动清理 7 天前的已处理建议，避免无限堆积
  useEffect(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    db.aiSuggestions
      .where('status')
      .anyOf(['accepted', 'dismissed'])
      .and((s) => s.createdAt < cutoff)
      .delete()
      .catch(() => {})
  }, [])

  // 清除所有已处理建议（保留待审核）
  const cleanupProcessed = useCallback(async () => {
    await db.aiSuggestions.where('status').anyOf(['accepted', 'dismissed']).delete()
  }, [])

  // 待审核建议（按时间倒序）
  const pendingSuggestions = (useLiveQuery(
    () => db.aiSuggestions.where('status').equals('pending').reverse().sortBy('createdAt'),
  ) ?? []) as AiSuggestion[]

  const runTask = useCallback(async (task: AuditTask, force?: boolean) => {
    if (!config) return
    const useForce = force ?? forceRefresh
    setRunning(true)
    setError(null)
    setLastCount(0)
    setCachedHit(false)
    setProgress(null)
    try {
      let txs = await db.transactions.toArray()
      if (task === 'analyzeMonth') {
        txs = txs.filter((t) => t.date.startsWith(selectedMonth))
      }
      if (txs.length === 0) {
        setError('没有可分析的流水')
        setRunning(false)
        return
      }

      // 审计缓存：按 task + 流水签名命中，避免重复调 API
      const cacheKey = hashKey(
        `${task}|${txs.map((t) => `${t.id}:${t.updatedAt}:${t.amount}:${t.category}`).sort().join('|')}`,
      )
      if (!useForce) {
        const cached = await db.auditCache.get(cacheKey)
        if (cached) {
          const reused = (JSON.parse(cached.suggestions) as AiSuggestion[]).map((s) => ({
            ...s,
            task,
            status: 'pending' as const,
            createdAt: Date.now(),
          }))
          if (reused.length > 0) await db.aiSuggestions.bulkAdd(reused)
          setLastCount(reused.length)
          setCachedHit(true)
          setRunning(false)
          return
        }
      }

      // 分批：超过 batchSize 则分块顺序调用，聚合结果
      const batchSize = config.batchSize ?? 120
      const chunks: typeof txs[] = []
      for (let i = 0; i < txs.length; i += batchSize) {
        chunks.push(txs.slice(i, i + batchSize))
      }
      setProgress({ current: 0, total: chunks.length })

      const all: AiSuggestion[] = []
      let lastErr: string | undefined
      for (let i = 0; i < chunks.length; i++) {
        const { suggestions, error: err } = await runLLMAudit(config, chunks[i], task)
        all.push(...suggestions)
        if (err) lastErr = err
        setProgress({ current: i + 1, total: chunks.length })
      }

      if (all.length > 0) {
        await db.aiSuggestions.bulkAdd(all)
        setLastCount(all.length)
        // 写缓存
        await db.auditCache.put({
          cacheKey,
          task,
          suggestions: JSON.stringify(all),
          txCount: txs.length,
          createdAt: Date.now(),
        })
      } else if (lastErr) {
        setError(lastErr)
      } else {
        setError('AI 未发现可建议的内容')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '运行失败')
    }
    setRunning(false)
    setProgress(null)
  }, [config, forceRefresh, selectedMonth])

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
    lastCount,
    cachedHit,
    progress,
    forceRefresh,
    setForceRefresh,
    selectedMonth,
    setSelectedMonth,
    runTask,
    applySuggestion,
    dismissSuggestion,
    clearAll,
    cleanupProcessed,
    hasApiKey: !!config?.apiKey && !!config?.endpoint && !!config?.model,
    privacyMode: config?.privacyMode ?? true,
  }
}
