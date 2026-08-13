import type { Transaction } from '@/db/types'

// 统计纯函数（C1）：从 hook useMemo 提取，可单测；聚合口径与历史实现一致。

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
