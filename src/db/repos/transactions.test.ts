import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { queryTransactions } from './transactions'
import type { Transaction } from '@/db/types'

// queryTransactions 索引下推契约（R2）：筛选不再全量加载，主索引（note/category/date/[type+date]）
// 缩小候选集后内存求交集，统一 date 降序（同日 id 降序）+ offset/limit 分页。
// fake-indexeddb 下 where('note') 若无索引会抛 SchemaError，查询成功即证明索引命中。

let seq = 0
function tx(over: Partial<Transaction> & Pick<Transaction, 'date' | 'category' | 'type' | 'amount'>): Transaction {
  seq += 1
  return { note: '', createdAt: seq, updatedAt: seq, ...over }
}

/** 7 笔样本：3 个日期（乱序写入验证排序）、3 分类、收支混合、中英文备注、一条空备注 */
async function seed(): Promise<void> {
  await db.transactions.bulkAdd([
    tx({ date: '2026-09-02', category: 'food', type: 'expense', amount: 35, note: 'Starbucks latte' }),
    tx({ date: '2026-09-01', category: 'food', type: 'expense', amount: 12.5, note: 'star 咖啡' }),
    tx({ date: '2026-09-03', category: 'transport', type: 'expense', amount: 88, note: '打车回家' }),
    tx({ date: '2026-09-02', category: 'salary', type: 'income', amount: 8000, note: '工资' }),
    tx({ date: '2026-08-31', category: 'food', type: 'expense', amount: 120, note: '超市购物' }),
    tx({ date: '2026-09-03', category: 'food', type: 'expense', amount: 20, note: '瑞幸咖啡' }),
    tx({ date: '2026-09-01', category: 'transport', type: 'expense', amount: 35, note: '' }),
  ])
}

describe('queryTransactions（R2 索引下推）', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    seq = 0
    await seed()
  })

  it('无条件：date 降序 + limit 截断（同日按 id 降序保证分页稳定）', async () => {
    const all = await queryTransactions({ limit: 100 })
    expect(all.map((t) => t.date)).toEqual([
      '2026-09-03', '2026-09-03',
      '2026-09-02', '2026-09-02',
      '2026-09-01', '2026-09-01',
      '2026-08-31',
    ])
    // 同日两笔（09-03：打车 id=3、瑞幸 id=6）按 id 降序
    expect(all[0].note).toBe('瑞幸咖啡')
    expect(all[1].note).toBe('打车回家')

    const page = await queryTransactions({ limit: 3 })
    expect(page).toHaveLength(3)
    expect(page.map((t) => t.date)).toEqual(['2026-09-03', '2026-09-03', '2026-09-02'])
  })

  it('分类筛选：走 category 索引，仅返回该分类', async () => {
    const r = await queryTransactions({ category: 'food', limit: 100 })
    expect(r).toHaveLength(4)
    expect(r.every((t) => t.category === 'food')).toBe(true)
    expect(r.map((t) => t.date)).toEqual(['2026-09-03', '2026-09-02', '2026-09-01', '2026-08-31'])
  })

  it('类型 + 分类组合：category 索引候选集上内存过 type', async () => {
    const r = await queryTransactions({ category: 'food', type: 'expense', limit: 100 })
    expect(r).toHaveLength(4) // food 全部为 expense
    const salary = await queryTransactions({ category: 'food', type: 'income', limit: 100 })
    expect(salary).toHaveLength(0)
  })

  it('备注前缀搜索：startsWithIgnoreCase 大小写不敏感（note 索引）', async () => {
    const r = await queryTransactions({ search: 'star', limit: 100 })
    expect(r.map((t) => t.note).sort()).toEqual(['Starbucks latte', 'star 咖啡'])

    const zh = await queryTransactions({ search: '瑞幸', limit: 100 })
    expect(zh.map((t) => t.note)).toEqual(['瑞幸咖啡'])

    // 前缀匹配：非前缀子串不命中（取舍：索引只支持前缀范围）
    const miss = await queryTransactions({ search: '咖啡', limit: 100 })
    expect(miss).toHaveLength(0)
  })

  it('搜索 + 分类组合：note 索引候选集与 category 条件取交集', async () => {
    const r = await queryTransactions({ search: 'star', category: 'food', limit: 100 })
    expect(r.map((t) => t.note).sort()).toEqual(['Starbucks latte', 'star 咖啡'])
    const none = await queryTransactions({ search: 'star', category: 'transport', limit: 100 })
    expect(none).toHaveLength(0)
  })

  it('日期范围：走 date 索引，含端点', async () => {
    const r = await queryTransactions({ dateStart: '2026-09-01', dateEnd: '2026-09-02', limit: 100 })
    expect(r).toHaveLength(4)
    expect(r.every((t) => t.date >= '2026-09-01' && t.date <= '2026-09-02')).toBe(true)

    const openEnd = await queryTransactions({ dateStart: '2026-09-03', limit: 100 })
    expect(openEnd).toHaveLength(2)
    const openStart = await queryTransactions({ dateEnd: '2026-08-31', limit: 100 })
    expect(openStart.map((t) => t.date)).toEqual(['2026-08-31'])
  })

  it('金额区间：min/max 含端点（全表扫 + 内存过滤路径）', async () => {
    const r = await queryTransactions({ amountMin: 30, amountMax: 120, limit: 100 })
    expect(r.map((t) => t.amount).sort((a, b) => a - b)).toEqual([35, 35, 88, 120])

    const min = await queryTransactions({ amountMin: 8000, limit: 100 })
    expect(min.map((t) => t.note)).toEqual(['工资'])
  })

  it('多条件组合：搜索 + 日期范围 + 金额区间交集', async () => {
    const r = await queryTransactions({
      search: 'star',
      dateStart: '2026-09-02',
      dateEnd: '2026-09-02',
      amountMin: 30,
      limit: 100,
    })
    expect(r.map((t) => t.note)).toEqual(['Starbucks latte'])
  })

  it('offset 分页：翻页与全量切片一致', async () => {
    const p1 = await queryTransactions({ limit: 3, offset: 0 })
    const p2 = await queryTransactions({ limit: 3, offset: 3 })
    const all = await queryTransactions({ limit: 100 })
    expect([...p1, ...p2]).toEqual(all.slice(0, 6))
    // 越界 offset 返回空
    expect(await queryTransactions({ limit: 3, offset: 99 })).toEqual([])
  })

  it('无 note 记录不进 note 索引：搜索不误伤，无条件查询仍可见', async () => {
    await db.transactions.add(
      tx({ date: '2026-09-05', category: 'food', type: 'expense', amount: 1, note: undefined }),
    )
    const searched = await queryTransactions({ search: '咖啡', limit: 100 })
    expect(searched).toHaveLength(0)
    const all = await queryTransactions({ limit: 100 })
    expect(all).toHaveLength(8)
    expect(all[0].date).toBe('2026-09-05')
  })
})
