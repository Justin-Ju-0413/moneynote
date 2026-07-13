import { describe, it, expect } from 'vitest'
import {
  stringSimilarity,
  isInSameTimeWindow,
  calculateSimilarity,
  detectDuplicates,
  DEFAULT_DEDUP_STRATEGY,
} from './dedup'
import type { Transaction } from '@/db/types'

function tx(over: Partial<Transaction> & { id: number }): Transaction {
  return { amount: 10, category: 'food', date: '2026-07-01', type: 'expense', createdAt: 0, updatedAt: 0, ...over }
}

describe('stringSimilarity', () => {
  it('完全相同为 1', () => {
    expect(stringSimilarity('星巴克', '星巴克')).toBe(1)
  })
  it('任一为空为 0', () => {
    expect(stringSimilarity('', 'abc')).toBe(0)
  })
  it('部分重叠在 (0,1)', () => {
    const s = stringSimilarity('星巴克拿铁', '星巴克咖啡')
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })
})

describe('isInSameTimeWindow', () => {
  it('SAME_DAY 精确匹配日期', () => {
    expect(isInSameTimeWindow('2026-07-01', '2026-07-01', 'SAME_DAY')).toBe(true)
    expect(isInSameTimeWindow('2026-07-01', '2026-07-02', 'SAME_DAY')).toBe(false)
  })
  it('SAME_MONTH 同年同月', () => {
    expect(isInSameTimeWindow('2026-07-01', '2026-07-31', 'SAME_MONTH')).toBe(true)
    expect(isInSameTimeWindow('2026-07-31', '2026-08-01', 'SAME_MONTH')).toBe(false)
  })
  it('SAME_YEAR 同年', () => {
    expect(isInSameTimeWindow('2026-01-01', '2026-12-31', 'SAME_YEAR')).toBe(true)
    expect(isInSameTimeWindow('2026-12-31', '2027-01-01', 'SAME_YEAR')).toBe(false)
  })
  it('null 窗口始终为真', () => {
    expect(isInSameTimeWindow('2026-01-01', '2027-12-31', null)).toBe(true)
  })
})

describe('calculateSimilarity', () => {
  it('金额完全相同该字段为 1', () => {
    const a = tx({ id: 1, amount: 28, note: 'x' })
    const b = tx({ id: 2, amount: 28, note: 'x', date: '2026-07-01' })
    // amount + date + note 全等 -> 1
    expect(calculateSimilarity(a, b, ['amount', 'date', 'note'])).toBe(1)
  })
  it('金额差异越大相似度越低', () => {
    const a = tx({ id: 1, amount: 10 })
    const b = tx({ id: 2, amount: 20, date: '2026-07-02' })
    const sim = calculateSimilarity(a, b, ['amount'])
    expect(sim).toBeCloseTo(0.5, 5) // 1 - 10/20
  })
  it('无字段时为 0', () => {
    expect(calculateSimilarity(tx({ id: 1 }), tx({ id: 2 }), [])).toBe(0)
  })
})

describe('detectDuplicates', () => {
  it('检测同日同额同备注的重复对', () => {
    const txs = [
      tx({ id: 1, amount: 28, note: '星巴克', date: '2026-07-01' }),
      tx({ id: 2, amount: 28, note: '星巴克', date: '2026-07-01' }),
      tx({ id: 3, amount: 100, note: '其他', date: '2026-07-02' }),
    ]
    const pairs = detectDuplicates(txs, DEFAULT_DEDUP_STRATEGY)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].entryAId).toBe(1)
    expect(pairs[0].entryBId).toBe(2)
    expect(pairs[0].status).toBe('PENDING')
  })

  it('不同月的不参与比较（SAME_MONTH 窗口）', () => {
    const txs = [
      tx({ id: 1, amount: 28, note: '星巴克', date: '2026-07-01' }),
      tx({ id: 2, amount: 28, note: '星巴克', date: '2026-08-01' }),
    ]
    expect(detectDuplicates(txs, DEFAULT_DEDUP_STRATEGY)).toHaveLength(0)
  })

  it('低于阈值的对被过滤', () => {
    const txs = [
      tx({ id: 1, amount: 28, note: '星巴克拿铁', date: '2026-07-01' }),
      tx({ id: 2, amount: 28, note: '完全不同的备注', date: '2026-07-01' }),
    ]
    // amount=1, date=1, note 很低 -> 平均可能低于 0.85
    const pairs = detectDuplicates(txs, DEFAULT_DEDUP_STRATEGY)
    // note 相似度极低，平均 (1+1+低)/3 < 0.85
    expect(pairs).toHaveLength(0)
  })
})
