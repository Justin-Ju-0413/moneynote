import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import { db } from '@/db'
import type { Transaction } from '@/db/types'

export function useTransactions() {
  // 获取最近交易
  const recentTransactions = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().limit(10).toArray(),
  ) || []

  // 获取指定日期范围的交易
  const getTransactionsByDateRange = useCallback(async (start: string, end: string) => {
    return db.transactions
      .where('date')
      .between(start, end, true, true)
      .reverse()
      .toArray()
  }, [])

  // 添加交易
  const addTransaction = useCallback(async (data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now()
    return db.transactions.add({
      ...data,
      createdAt: now,
      updatedAt: now,
    })
  }, [])

  // 更新交易
  const updateTransaction = useCallback(async (id: number, data: Partial<Transaction>) => {
    return db.transactions.update(id, { ...data, updatedAt: Date.now() })
  }, [])

  // 删除交易
  const deleteTransaction = useCallback(async (id: number) => {
    return db.transactions.delete(id)
  }, [])

  // 今日支出
  const todayExpense = useLiveQuery(async () => {
    const today = new Date().toISOString().split('T')[0]
    const txs = await db.transactions.where('[type+date]').equals(['expense', today]).toArray()
    return txs.reduce((sum, t) => sum + t.amount, 0)
  }) ?? 0

  // 本月支出
  const monthExpense = useLiveQuery(async () => {
    const start = dayjs().startOf('month').format('YYYY-MM-DD')
    const end = dayjs().endOf('month').format('YYYY-MM-DD')
    const txs = await db.transactions.where('date').between(start, end, true, true).toArray()
    return txs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  }) ?? 0

  // 本月收入
  const monthIncome = useLiveQuery(async () => {
    const start = dayjs().startOf('month').format('YYYY-MM-DD')
    const end = dayjs().endOf('month').format('YYYY-MM-DD')
    const txs = await db.transactions.where('date').between(start, end, true, true).toArray()
    return txs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  }) ?? 0

  return {
    recentTransactions,
    getTransactionsByDateRange,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    todayExpense,
    monthExpense,
    monthIncome,
  }
}
