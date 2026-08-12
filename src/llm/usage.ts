import { db } from '@/db'
import type { LlmUsage } from '@/db/types'
import * as log from '@/utils/log'

// ── LLM token 用量记录（C3 成本可观测）──

/**
 * 记录一次 LLM 调用的 token 用量（runTask 统一咽喉写入）。
 * usage 为空（provider 未返回）直接返回；失败仅告警，不得影响识别链路。
 */
export async function recordLLMUsage(
  task: string,
  model: string,
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number },
): Promise<void> {
  if (!usage || usage.totalTokens <= 0) return
  try {
    await db.llmUsage.add({
      task,
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      createdAt: Date.now(),
    })
  } catch (err) { log.warn('LLM 用量记录失败', err) }
}

/** 区间内用量（月度聚合用；start/end 为毫秒时间戳，含端点） */
export async function listUsageBetween(start: number, end: number): Promise<LlmUsage[]> {
  return db.llmUsage.where('createdAt').between(start, end, true, true).toArray()
}

/** 清理超过 days 天的用量记录（惰性，UI 挂载时调一次）；返回删除数 */
export async function cleanupLLMUsage(days = 90): Promise<number> {
  try {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const stale = await db.llmUsage.where('createdAt').below(cutoff).delete()
    return stale
  } catch (err) { log.warn('LLM 用量清理失败', err); return 0 }
}
