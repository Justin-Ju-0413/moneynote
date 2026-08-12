import { describe, it, expect } from 'vitest'
import { filterTransactions } from './transactionFilter'
import type { Transaction } from '@/db/types'

function tx(over: Partial<Transaction> & { id: number }): Transaction {
  return {
    amount: 0,
    date: '2026-07-01',
    type: 'expense',
    category: 'food',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

const NAME: Record<string, string> = { food: '餐饮', transport: '交通' }

describe('filterTransactions（C2-b-2）', () => {
  const txs: Transaction[] = [
    tx({ id: 1, note: '星巴克咖啡', amount: 35, category: 'food', date: '2026-07-01' }),
    tx({ id: 2, note: '打车回家', amount: 15, category: 'transport', date: '2026-07-02' }),
    tx({ id: 3, note: '超市购物', amount: 88.5, category: 'food', date: '2026-07-03' }),
  ]

  it('note 子串匹配（大小写不敏感）', () => {
    const r = filterTransactions(txs, { search: '咖啡', getCategoryName: (id) => NAME[id] })
    expect(r.map((t) => t.id)).toEqual([1])
    const r2 = filterTransactions(txs, { search: 'STARBUCKS', getCategoryName: (id) => NAME[id] })
    expect(r2).toHaveLength(0)
  })

  it('分类名匹配', () => {
    const r = filterTransactions(txs, { search: '交通', getCategoryName: (id) => NAME[id] })
    expect(r.map((t) => t.id)).toEqual([2])
  })

  it('金额字符串匹配', () => {
    const r = filterTransactions(txs, { search: '88.5', getCategoryName: (id) => NAME[id] })
    expect(r.map((t) => t.id)).toEqual([3])
  })

  it('分类过滤', () => {
    const r = filterTransactions(txs, { category: 'food', getCategoryName: (id) => NAME[id] })
    expect(r.map((t) => t.id)).toEqual([1, 3])
  })

  it('无筛选时返回全量', () => {
    const r = filterTransactions(txs, { getCategoryName: (id) => NAME[id] })
    expect(r).toHaveLength(3)
  })
})
