import { db } from '@/db'
import type { LLMParseResult } from '@/llm/types'
import { generateCacheKey, hasExplicitDate } from './cacheKeyNormalizer'
import dayjs from 'dayjs'

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 天
const CONFIDENCE_THRESHOLD = 0.7
const MAX_CACHE_SIZE = 5000
const EVICTION_RATIO = 0.2

/**
 * 查询 AI 解析结果缓存。
 * 命中时刷新 updatedAt（滑动过期），未命中或过期返回 null。
 */
export async function lookupParseCache(rawInput: string): Promise<LLMParseResult | null> {
  const cacheKey = generateCacheKey(rawInput)
  if (!cacheKey) return null

  try {
    const entry = await db.parseCache.get(cacheKey)
    if (!entry) return null

    // TTL 检查（惰性过期）
    if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
      // 过期：异步删除，不阻塞返回
      db.parseCache.delete(cacheKey).catch(() => {})
      return null
    }

    // 更新命中统计（异步，不阻塞）
    db.parseCache.update(cacheKey, {
      hitCount: entry.hitCount + 1,
      updatedAt: Date.now(),
    }).catch(() => {})

    // 恢复日期：如果缓存时没有明确日期，填入当天日期
    const result = { ...entry.result }
    if (!result.date) {
      result.date = dayjs().format('YYYY-MM-DD')
    }

    return result
  } catch {
    return null
  }
}

/**
 * 写入 AI 解析结果到缓存。
 * 仅缓存 confidence >= 0.7 的结果。
 */
export async function writeParseCache(rawInput: string, result: LLMParseResult): Promise<void> {
  if (result.confidence < CONFIDENCE_THRESHOLD) return

  const cacheKey = generateCacheKey(rawInput)
  if (!cacheKey) return

  try {
    const now = Date.now()

    // 如果原始输入不包含明确日期，缓存时将 date 置空
    // 读取时会填入当天日期，避免缓存过期日期
    const cacheResult = { ...result }
    if (!hasExplicitDate(rawInput)) {
      cacheResult.date = '' as string
    }

    await db.parseCache.put({
      cacheKey,
      result: cacheResult,
      originalInput: rawInput,
      hitCount: 0,
      createdAt: now,
      updatedAt: now,
    })

    // 异步执行容量限制，不阻塞主流程
    enforceSizeLimit().catch(() => {})
  } catch {
    // 写入失败静默处理，不影响主流程
  }
}

/**
 * 容量限制：超过 MAX_CACHE_SIZE 时淘汰最久未使用的 20%。
 */
async function enforceSizeLimit(): Promise<void> {
  const count = await db.parseCache.count()
  if (count <= MAX_CACHE_SIZE) return

  const deleteCount = Math.ceil(count * EVICTION_RATIO)
  const oldestKeys = await db.parseCache
    .orderBy('updatedAt')
    .limit(deleteCount)
    .primaryKeys()

  if (oldestKeys.length > 0) {
    await db.parseCache.bulkDelete(oldestKeys)
  }
}
