// 模糊去重：基于相似度 + 时间窗的可配置查重
// 移植自 finance-app src/services/dedup/DedupService.ts，适配 MoneyNote Transaction（date 为 "YYYY-MM-DD"）
import type { Transaction, DedupStrategy, DedupRecord, DedupTimeWindow, DedupMatchField } from '@/db/types'

// 默认策略：同月内，金额/日期/备注综合相似度 >= 0.85 视为疑似重复
export const DEFAULT_DEDUP_STRATEGY: DedupStrategy = {
  id: 'default',
  name: '默认查重策略',
  matchFields: ['amount', 'date', 'note'],
  similarityThreshold: 0.85,
  timeWindow: 'SAME_MONTH',
  isDefault: true,
  createdAt: 0,
  updatedAt: 0,
}

// 字符级 Jaccard 相似度
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const setA = new Set(a.split(''))
  const setB = new Set(b.split(''))
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return union.size > 0 ? intersection.size / union.size : 0
}

// 周序号（ISO 风格近似）
function getWeekNumber(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - start.getTime()
  return Math.ceil((diff / (24 * 60 * 60 * 1000) + start.getDay() + 1) / 7)
}

// 两笔交易是否落在同一时间窗内
export function isInSameTimeWindow(dateA: string, dateB: string, window: DedupTimeWindow | null): boolean {
  if (!window) return true
  const a = new Date(dateA)
  const b = new Date(dateB)
  switch (window) {
    case 'SAME_DAY':
      return dateA === dateB
    case 'SAME_WEEK':
      return a.getFullYear() === b.getFullYear() && getWeekNumber(a) === getWeekNumber(b)
    case 'SAME_MONTH':
      return dateA.slice(0, 7) === dateB.slice(0, 7)
    case 'SAME_QUARTER':
      return a.getFullYear() === b.getFullYear() && Math.floor(a.getMonth() / 3) === Math.floor(b.getMonth() / 3)
    case 'SAME_YEAR':
      return a.getFullYear() === b.getFullYear()
    default:
      return true
  }
}

// 单字段相似度
function fieldSimilarity(a: Transaction, b: Transaction, field: DedupMatchField): number {
  switch (field) {
    case 'amount': {
      const maxAmount = Math.max(Math.abs(a.amount), Math.abs(b.amount))
      if (maxAmount === 0) return a.amount === b.amount ? 1 : 0
      return 1 - Math.abs(a.amount - b.amount) / maxAmount
    }
    case 'date':
      return a.date === b.date ? 1 : 0
    case 'note':
      return stringSimilarity(a.note ?? '', b.note ?? '')
    default:
      return 0
  }
}

// 综合相似度（各字段平均）
export function calculateSimilarity(a: Transaction, b: Transaction, matchFields: DedupMatchField[]): number {
  if (matchFields.length === 0) return 0
  const total = matchFields.reduce((sum, field) => sum + fieldSimilarity(a, b, field), 0)
  return total / matchFields.length
}

// 检测疑似重复对（纯逻辑，不写库）
export function detectDuplicates(
  transactions: Transaction[],
  strategy: DedupStrategy = DEFAULT_DEDUP_STRATEGY,
): Omit<DedupRecord, 'id'>[] {
  const pairs: Omit<DedupRecord, 'id'>[] = []
  const detectTime = Date.now()

  for (let i = 0; i < transactions.length; i++) {
    for (let j = i + 1; j < transactions.length; j++) {
      const a = transactions[i]
      const b = transactions[j]
      if (a.id === undefined || b.id === undefined) continue
      if (!isInSameTimeWindow(a.date, b.date, strategy.timeWindow)) continue

      const similarity = calculateSimilarity(a, b, strategy.matchFields)
      if (similarity >= strategy.similarityThreshold) {
        pairs.push({
          entryAId: a.id,
          entryBId: b.id,
          similarity,
          status: 'PENDING',
          action: null,
          detectTime,
        })
      }
    }
  }

  return pairs
}
