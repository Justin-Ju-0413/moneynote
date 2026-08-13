import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/db'
import {
  getRecentTransactions,
  getTransactionsByDateRange,
  getAllTransactions,
  getTransactionsByTypeInRange,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  countTransactionsByCategory,
} from './transactions'
import { getCategories, addCategory, updateCategory, deleteCategory } from './categories'
import { computeRangeStats, sumAmount } from './stats'
import type { Transaction } from '@/db/types'

function tx(over: Partial<Transaction> & { id: number }): Transaction {
  return {
    amount: 10,
    date: '2026-07-01',
    type: 'expense',
    category: 'food',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

beforeEach(async () => {
  await db.transactions.clear()
  await db.categories.clear()
})

describe('repos/transactions', () => {
  it('getRecentTransactions 按 date 倒序 + limit', async () => {
    await db.transactions.bulkAdd([
      tx({ id: 1, date: '2026-07-01' }),
      tx({ id: 2, date: '2026-07-03' }),
      tx({ id: 3, date: '2026-07-02' }),
    ])
    const r = await getRecentTransactions(2)
    expect(r.map((t) => t.id)).toEqual([2, 3])
  })

  it('getTransactionsByDateRange 含端点区间', async () => {
    await db.transactions.bulkAdd([
      tx({ id: 1, date: '2026-07-01' }),
      tx({ id: 2, date: '2026-07-15' }),
      tx({ id: 3, date: '2026-08-01' }),
    ])
    const r = await getTransactionsByDateRange('2026-07-01', '2026-07-31')
    expect(r.map((t) => t.id)).toEqual([2, 1]) // date 倒序
  })

  it('getTransactionsByTypeInRange 走 [type+date] 语义', async () => {
    await db.transactions.bulkAdd([
      tx({ id: 1, type: 'expense', date: '2026-07-01' }),
      tx({ id: 2, type: 'income', date: '2026-07-01' }),
      tx({ id: 3, type: 'expense', date: '2026-08-01' }),
    ])
    const r = await getTransactionsByTypeInRange('expense', '2026-07-01', '2026-07-31')
    expect(r.map((t) => t.id)).toEqual([1])
  })

  it('addTransaction 补 createdAt/updatedAt', async () => {
    const id = await addTransaction({ amount: 5, date: '2026-07-01', type: 'expense', category: 'food', note: 'x' })
    const row = await db.transactions.get(id)
    expect(row?.createdAt).toBeGreaterThan(0)
    expect(row?.updatedAt).toBeGreaterThan(0)
  })

  it('updateTransaction 补 updatedAt', async () => {
    const id = await addTransaction({ amount: 5, date: '2026-07-01', type: 'expense', category: 'food', note: 'x' })
    await updateTransaction(id!, { amount: 8 })
    const row = await db.transactions.get(id!)
    expect(row?.amount).toBe(8)
    expect(row?.updatedAt).toBeGreaterThanOrEqual(row!.createdAt)
  })

  it('deleteTransaction / getAllTransactions / countTransactionsByCategory', async () => {
    await db.transactions.bulkAdd([
      tx({ id: 1, category: 'food' }),
      tx({ id: 2, category: 'food' }),
      tx({ id: 3, category: 'transport' }),
    ])
    expect(await getAllTransactions()).toHaveLength(3)
    expect(await countTransactionsByCategory('food')).toBe(2)
    await deleteTransaction(1)
    expect(await getAllTransactions()).toHaveLength(2)
  })
})

describe('repos/categories', () => {
  it('add/get/update/delete 全链路', async () => {
    const id = await addCategory({ id: 'custom', name: '自定义', icon: '⭐', color: '#fff', keywords: [], sortOrder: 99, type: 'expense' })
    expect(id).toBe('custom')
    const all = await getCategories()
    expect(all.map((c) => c.id)).toContain('custom')
    expect(all.find((c) => c.id === 'custom')?.isBuiltIn).toBe(false)
    await updateCategory('custom', { name: '改名' })
    expect((await getCategories()).find((c) => c.id === 'custom')?.name).toBe('改名')
    await deleteCategory('custom')
    expect(await getCategories()).toHaveLength(0)
  })
})

describe('repos/stats 纯函数', () => {
  it('computeRangeStats 聚合多类型/分类/日期', () => {
    const txs: Transaction[] = [
      tx({ id: 1, amount: 30, type: 'expense', category: 'food', date: '2026-07-01' }),
      tx({ id: 2, amount: 20, type: 'expense', category: 'transport', date: '2026-07-01' }),
      tx({ id: 3, amount: 100, type: 'income', category: 'salary', date: '2026-07-05' }),
      tx({ id: 4, amount: 10, type: 'expense', category: 'food', date: '2026-07-08' }),
    ]
    const s = computeRangeStats(txs)
    expect(s.totalExpense).toBe(60)
    expect(s.totalIncome).toBe(100)
    expect(s.netIncome).toBe(40)
    expect(s.byCategory).toEqual({ food: 40, transport: 20 })
    expect(s.byCategoryIncome).toEqual({ salary: 100 })
    expect(s.byDate).toEqual({ '2026-07-01': 50, '2026-07-08': 10 })
    expect(s.count).toBe(3)
    expect(s.incomeCount).toBe(1)
  })

  it('sumAmount 求和（空数组为 0）', () => {
    expect(sumAmount([])).toBe(0)
    expect(sumAmount([tx({ id: 1, amount: 3 }), tx({ id: 2, amount: 4 })] as Transaction[])).toBe(7)
  })
})
