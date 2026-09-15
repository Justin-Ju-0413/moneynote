import { db } from '@/db'
import { getTransactionsByTypeInRange } from './transactions'
import dayjs from 'dayjs'
import type { Transaction } from '@/db/types'

// 统计纯函数（C1）：从 hook useMemo 提取，可单测；聚合口径与历史实现一致。
// 查询函数（R2 统计深度）：月环比/同比、预算建议，均走既有索引（[type+date] / date），不改 schema。

export interface RangeStats {
  totalExpense: number
  totalIncome: number
  netIncome: number
  byCategory: Record<string, number>      // 支出按分类
  byCategoryIncome: Record<string, number> // 收入按分类
  byDate: Record<string, number>          // 支出按日期
  count: number                            // 支出笔数
  incomeCount: number                      // 收入笔数
}

/** 区间统计（原 useStats useMemo 逻辑） */
export function computeRangeStats(txs: Transaction[]): RangeStats {
  const expenses = txs.filter((t) => t.type === 'expense')
  const incomes = txs.filter((t) => t.type === 'income')
  const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0)
  const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0)

  const byCategory = expenses.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount
    return acc
  }, {})

  const byCategoryIncome = incomes.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount
    return acc
  }, {})

  const byDate = expenses.reduce<Record<string, number>>((acc, t) => {
    acc[t.date] = (acc[t.date] || 0) + t.amount
    return acc
  }, {})

  return {
    totalExpense,
    totalIncome,
    netIncome: totalIncome - totalExpense,
    byCategory,
    byCategoryIncome,
    byDate,
    count: expenses.length,
    incomeCount: incomes.length,
  }
}

/** 金额求和 */
export function sumAmount(txs: Transaction[]): number {
  return txs.reduce((sum, t) => sum + t.amount, 0)
}

/** 变化率（%）：基数为 0 或负时无法计算，返回 null（调用方隐藏标注） */
function pctChange(current: number, base: number): number | null {
  if (base <= 0) return null
  return ((current - base) / base) * 100
}

/** 区间支出总额（走 [type+date] 索引） */
export async function getExpenseTotalInRange(start: string, end: string): Promise<number> {
  const txs = await getTransactionsByTypeInRange('expense', start, end)
  return sumAmount(txs)
}

/** 区间内是否存在任意交易（不分类型）：环比/同比「有无数据」判定，避免把「支出 0」误判为「无数据」 */
export async function hasAnyTransactionInRange(start: string, end: string): Promise<boolean> {
  const first = await db.transactions.where('date').between(start, end, true, true).first()
  return first !== undefined
}

/** [start, end] 日期区间（含端点） */
export type DateRangeTuple = [string, string]

/** 月环比/同比对比结果（支出口径） */
export interface MonthCompareData {
  current: number
  previous: number
  lastYear: number
  /** 上月是否存在任意交易（false 时环比不展示） */
  hasPreviousData: boolean
  /** 去年同月是否存在任意交易（false 时同比柱与标注都不展示） */
  hasLastYearData: boolean
  /** 较上月变化 %；上月无支出或无数据时为 null */
  momPct: number | null
  /** 较去年同月变化 %；去年无数据或去年支出为 0 时为 null */
  yoyPct: number | null
}

/**
 * 月度支出对比（本月 / 上月 / 去年同月），并发查询三个区间。
 * 去年同月判定口径：该月存在任意收支交易即视为「有数据」，展示第三根柱；
 * 同比 % 仅在去年同月支出 > 0 时计算。
 */
export async function getMonthCompareExpense(ranges: {
  current: DateRangeTuple
  previous: DateRangeTuple
  lastYear: DateRangeTuple
}): Promise<MonthCompareData> {
  const [current, previous, lastYear, hasPreviousData, hasLastYearData] = await Promise.all([
    getExpenseTotalInRange(ranges.current[0], ranges.current[1]),
    getExpenseTotalInRange(ranges.previous[0], ranges.previous[1]),
    getExpenseTotalInRange(ranges.lastYear[0], ranges.lastYear[1]),
    hasAnyTransactionInRange(ranges.previous[0], ranges.previous[1]),
    hasAnyTransactionInRange(ranges.lastYear[0], ranges.lastYear[1]),
  ])
  return {
    current,
    previous,
    lastYear,
    hasPreviousData,
    hasLastYearData,
    momPct: hasPreviousData ? pctChange(current, previous) : null,
    yoyPct: hasLastYearData ? pctChange(current, lastYear) : null,
  }
}

/** 分类月均支出统计（预算建议用） */
export interface CategoryMonthlyAverage {
  /** 有支出月份的月均（无数据时为 0） */
  average: number
  /** 窗口内有支出的完整月份数（0..months） */
  monthsWithData: number
}

/**
 * 近 n 个完整月（不含 baseMonth 当月，避免半月中拉低均值）某分类月均支出。
 * categoryId 为 'total' 时统计全部支出；走 [type+date] 索引后内存过滤分类。
 * baseMonth 传 'YYYY-MM-DD'（任意一天）锚定统计窗口，缺省用今天。
 */
export async function getCategoryMonthlyAverage(
  categoryId: string,
  options?: { months?: number; baseMonth?: string },
): Promise<CategoryMonthlyAverage> {
  const months = Math.max(1, options?.months ?? 3)
  const base = dayjs(options?.baseMonth).startOf('month')
  const start = base.subtract(months, 'month').startOf('month').format('YYYY-MM-DD')
  const end = base.subtract(1, 'month').endOf('month').format('YYYY-MM-DD')

  const txs = await getTransactionsByTypeInRange('expense', start, end)
  const relevant = categoryId === 'total' ? txs : txs.filter((t) => t.category === categoryId)

  // 按月分桶（date 为 'YYYY-MM-DD'，前 7 位即月份），只统计有支出的月份
  const byMonth = new Map<string, number>()
  for (const t of relevant) {
    const month = t.date.slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + t.amount)
  }
  const monthTotals = [...byMonth.values()].filter((v) => v > 0)
  if (monthTotals.length === 0) return { average: 0, monthsWithData: 0 }
  const sum = monthTotals.reduce((s, v) => s + v, 0)
  return { average: sum / monthTotals.length, monthsWithData: monthTotals.length }
}
