import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/db'
import {
  getExpenseTotalInRange,
  hasAnyTransactionInRange,
  getMonthCompareExpense,
  getCategoryMonthlyAverage,
} from './stats'
import type { Transaction } from '@/db/types'

function seed(over: Partial<Transaction> & { date: string }) {
  return db.transactions.add({
    amount: 10,
    type: 'expense',
    category: 'food',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  })
}

beforeEach(async () => {
  await db.transactions.clear()
})

describe('repos/stats 查询函数（R2）', () => {
  it('getExpenseTotalInRange 只汇总区间内支出', async () => {
    await seed({ date: '2026-08-05', amount: 30 })
    await seed({ date: '2026-08-20', amount: 20, category: 'transport' })
    await seed({ date: '2026-08-10', amount: 100, type: 'income', category: 'salary' })
    await seed({ date: '2026-09-01', amount: 999 })
    expect(await getExpenseTotalInRange('2026-08-01', '2026-08-31')).toBe(50)
  })

  it('hasAnyTransactionInRange 区分「无数据」与「支出为 0」', async () => {
    expect(await hasAnyTransactionInRange('2026-08-01', '2026-08-31')).toBe(false)
    // 仅收入也算「有数据」
    await seed({ date: '2026-08-10', amount: 100, type: 'income', category: 'salary' })
    expect(await hasAnyTransactionInRange('2026-08-01', '2026-08-31')).toBe(true)
  })

  it('getMonthCompareExpense 计算环比/同比（含去年同月）', async () => {
    await seed({ date: '2026-07-10', amount: 200 }) // 上月
    await seed({ date: '2026-08-01', amount: 100 }) // 本月
    await seed({ date: '2026-08-15', amount: 50 }) // 本月
    await seed({ date: '2025-08-20', amount: 100 }) // 去年同月
    const r = await getMonthCompareExpense({
      current: ['2026-08-01', '2026-08-31'],
      previous: ['2026-07-01', '2026-07-31'],
      lastYear: ['2025-08-01', '2025-08-31'],
    })
    expect(r.current).toBe(150)
    expect(r.previous).toBe(200)
    expect(r.lastYear).toBe(100)
    expect(r.hasPreviousData).toBe(true)
    expect(r.hasLastYearData).toBe(true)
    expect(r.momPct).toBe(-25)
    expect(r.yoyPct).toBe(50)
  })

  it('getMonthCompareExpense 去年同月无数据：不展示同比，环比照常', async () => {
    await seed({ date: '2026-08-01', amount: 100 })
    await seed({ date: '2026-07-01', amount: 100 })
    const r = await getMonthCompareExpense({
      current: ['2026-08-01', '2026-08-31'],
      previous: ['2026-07-01', '2026-07-31'],
      lastYear: ['2025-08-01', '2025-08-31'],
    })
    expect(r.hasLastYearData).toBe(false)
    expect(r.lastYear).toBe(0)
    expect(r.yoyPct).toBeNull()
    expect(r.momPct).toBe(0)
  })

  it('getMonthCompareExpense 去年同月有收入但支出为 0：有数据但同比为 null', async () => {
    await seed({ date: '2026-08-01', amount: 100 })
    await seed({ date: '2025-08-01', amount: 500, type: 'income', category: 'salary' })
    const r = await getMonthCompareExpense({
      current: ['2026-08-01', '2026-08-31'],
      previous: ['2026-07-01', '2026-07-31'],
      lastYear: ['2025-08-01', '2025-08-31'],
    })
    expect(r.hasLastYearData).toBe(true)
    expect(r.lastYear).toBe(0)
    expect(r.yoyPct).toBeNull()
  })

  it('getMonthCompareExpense 上月无数据：环比为 null', async () => {
    await seed({ date: '2026-08-01', amount: 100 })
    const r = await getMonthCompareExpense({
      current: ['2026-08-01', '2026-08-31'],
      previous: ['2026-07-01', '2026-07-31'],
      lastYear: ['2025-08-01', '2025-08-31'],
    })
    expect(r.hasPreviousData).toBe(false)
    expect(r.momPct).toBeNull()
  })

  it('getCategoryMonthlyAverage 按分类统计有支出月份的月均（不含当月）', async () => {
    // baseMonth 2026-06 → 窗口 2026-03 ~ 2026-05
    await seed({ date: '2026-03-05', amount: 100 })
    await seed({ date: '2026-03-20', amount: 50 })
    await seed({ date: '2026-04-10', amount: 200 })
    await seed({ date: '2026-05-10', amount: 500, category: 'transport' }) // 其他分类不计入 food
    await seed({ date: '2026-06-02', amount: 999 }) // 当月排除
    const food = await getCategoryMonthlyAverage('food', { months: 3, baseMonth: '2026-06-01' })
    expect(food.monthsWithData).toBe(2)
    expect(food.average).toBe(175)
    const total = await getCategoryMonthlyAverage('total', { months: 3, baseMonth: '2026-06-01' })
    expect(total.monthsWithData).toBe(3)
    expect(total.average).toBeCloseTo(850 / 3, 10)
  })

  it('getCategoryMonthlyAverage 无数据返回 0', async () => {
    const r = await getCategoryMonthlyAverage('food', { months: 3, baseMonth: '2026-06-01' })
    expect(r.monthsWithData).toBe(0)
    expect(r.average).toBe(0)
  })
})
