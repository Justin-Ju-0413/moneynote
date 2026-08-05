import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, bulkImportTransactions } from './index'

function category(id: string, name: string, type: 'expense' | 'income') {
  return { id, name, icon: '●', color: '#3b82f6', keywords: [], sortOrder: 0, isBuiltIn: true, type }
}

describe('bulkImportTransactions', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
    await db.budgets.clear()
    await db.categories.bulkAdd([category('food', '餐饮', 'expense'), category('salary', '工资', 'income')])
  })

  it('批量导入新交易', async () => {
    const r = await bulkImportTransactions([
      { amount: 10, category: 'food', date: '2026-08-01', type: 'expense' as const, note: 'a' },
      { amount: 20, category: 'salary', date: '2026-08-02', type: 'income' as const, note: 'b' },
    ])
    expect(r).toEqual({ imported: 2, skipped: 0 })
    expect(await db.transactions.count()).toBe(2)
  })

  it('date+amount+note 全同视为重复跳过', async () => {
    const tx = { amount: 10, category: 'food', date: '2026-08-01', type: 'expense' as const, note: 'a' }
    await bulkImportTransactions([tx])
    const r = await bulkImportTransactions([tx])
    expect(r).toEqual({ imported: 0, skipped: 1 })
  })

  it('备注不同则不视为重复', async () => {
    await bulkImportTransactions([{ amount: 10, category: 'food', date: '2026-08-01', type: 'expense' as const, note: 'a' }])
    const r = await bulkImportTransactions([{ amount: 10, category: 'food', date: '2026-08-01', type: 'expense' as const, note: 'b' }])
    expect(r.imported).toBe(1)
    expect(r.skipped).toBe(0)
  })

  it('导入写入 createdAt/updatedAt', async () => {
    const before = Date.now()
    await bulkImportTransactions([{ amount: 5, category: 'food', date: '2026-08-01', type: 'expense' as const, note: 'x' }])
    const tx = (await db.transactions.toArray())[0]
    expect(tx.createdAt).toBeGreaterThanOrEqual(before)
    expect(tx.updatedAt).toBeGreaterThanOrEqual(before)
  })
})

describe('categories CRUD', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.categories.bulkAdd([category('food', '餐饮', 'expense')])
  })

  it('增删改查', async () => {
    await db.categories.add(category('test_cat', '测试', 'expense'))
    expect((await db.categories.get('test_cat'))?.name).toBe('测试')

    await db.categories.update('test_cat', { name: '测试2' })
    expect((await db.categories.get('test_cat'))?.name).toBe('测试2')

    await db.categories.delete('test_cat')
    expect(await db.categories.get('test_cat')).toBeUndefined()
  })

  it('内置分类也可被删除', async () => {
    await db.categories.delete('food')
    expect(await db.categories.get('food')).toBeUndefined()
  })
})

describe('budgets CRUD', () => {
  beforeEach(async () => {
    await db.budgets.clear()
  })

  it('增删改查', async () => {
    const id = await db.budgets.add({
      category: 'food', amount: 1000, period: 'monthly', createdAt: Date.now(), updatedAt: Date.now(),
    })
    expect((await db.budgets.get(id))?.amount).toBe(1000)

    await db.budgets.update(id, { amount: 1500 })
    expect((await db.budgets.get(id))?.amount).toBe(1500)

    await db.budgets.delete(id)
    expect(await db.budgets.get(id)).toBeUndefined()
  })
})
