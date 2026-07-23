import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'

// schema 契约单测:用 fake-indexeddb 在 node 环境验证 DB 打开、13 张表存在、
// transactions CRUD、以及 [type+date] 复合索引的范围查询(月收支聚合依赖)。
// 为未来 upgrade() 数据迁移提供测试地基(ROADMAP P1-6)。
describe('schema 契约', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })

  it('db 打开并具备全部 13 张表', () => {
    expect(db.transactions).toBeDefined()
    expect(db.categories).toBeDefined()
    expect(db.budgets).toBeDefined()
    expect(db.settings).toBeDefined()
    expect(db.classificationCache).toBeDefined()
    expect(db.parseCache).toBeDefined()
    expect(db.billTemplates).toBeDefined()
    expect(db.aiSuggestions).toBeDefined()
    expect(db.dedupStrategies).toBeDefined()
    expect(db.dedupRecords).toBeDefined()
    expect(db.backups).toBeDefined()
    expect(db.auditCache).toBeDefined()
    expect(db.chatMessages).toBeDefined()
  })

  it('transactions CRUD', async () => {
    const id = await db.transactions.add({
      amount: 10,
      category: 'food',
      date: '2026-07-23',
      type: 'expense',
      note: '测试',
      createdAt: 1,
      updatedAt: 1,
    })
    expect((await db.transactions.get(id))?.amount).toBe(10)

    await db.transactions.update(id, { amount: 20 })
    expect((await db.transactions.get(id))?.amount).toBe(20)

    await db.transactions.delete(id)
    expect(await db.transactions.get(id)).toBeUndefined()
  })

  it('[type+date] 复合索引支持按类型+日期范围查询', async () => {
    await db.transactions.bulkAdd([
      { amount: 10, category: 'food', date: '2026-07-01', type: 'expense', note: 'a', createdAt: 1, updatedAt: 1 },
      { amount: 20, category: 'food', date: '2026-07-15', type: 'expense', note: 'b', createdAt: 2, updatedAt: 2 },
      { amount: 30, category: 'salary', date: '2026-07-15', type: 'income', note: 'c', createdAt: 3, updatedAt: 3 },
    ])
    const expense = await db.transactions
      .where('[type+date]')
      .between(['expense', '2026-07-01'], ['expense', '2026-07-31'], true, true)
      .toArray()
    expect(expense).toHaveLength(2)
    expect(expense.every((t) => t.type === 'expense')).toBe(true)

    const income = await db.transactions
      .where('[type+date]')
      .between(['income', '2026-07-01'], ['income', '2026-07-31'], true, true)
      .toArray()
    expect(income).toHaveLength(1)
    expect(income[0].category).toBe('salary')
  })

  it('chatMessages 表可读写(聊天历史持久化)', async () => {
    await db.chatMessages.clear()
    const id = await db.chatMessages.add({
      role: 'user',
      content: '测试',
      createdAt: 1,
    })
    const all = await db.chatMessages.orderBy('createdAt').toArray()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(id)
    await db.chatMessages.clear()
  })
})
