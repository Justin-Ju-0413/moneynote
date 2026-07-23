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

  // 今日支出(用本地日期,与交易 date 格式一致;原 toISOString 取 UTC,UTC+8 凌晨会误判为昨天)
  const todayExpense = useLiveQuery(async () => {
    const today = dayjs().format('YYYY-MM-DD')
    const txs = await db.transactions.where('[type+date]').equals(['expense', today]).toArray()
    return txs.reduce((sum, t) => sum + t.amount, 0)
  }) ?? 0

  // 本月支出(走 [type+date] 复合索引:单次索引查询替代全月 toArray + 前端 filter)
  const monthExpense = useLiveQuery(async () => {
    const start = dayjs().startOf('month').format('YYYY-MM-DD')
    const end = dayjs().endOf('month').format('YYYY-MM-DD')
    const txs = await db.transactions
      .where('[type+date]')
      .between(['expense', start], ['expense', end], true, true)
      .toArray()
    return txs.reduce((sum, t) => sum + t.amount, 0)
  }) ?? 0

  // 本月收入(走 [type+date] 复合索引)
  const monthIncome = useLiveQuery(async () => {
    const start = dayjs().startOf('month').format('YYYY-MM-DD')
    const end = dayjs().endOf('month').format('YYYY-MM-DD')
    const txs = await db.transactions
      .where('[type+date]')
      .between(['income', start], ['income', end], true, true)
      .toArray()
    return txs.reduce((sum, t) => sum + t.amount, 0)
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
