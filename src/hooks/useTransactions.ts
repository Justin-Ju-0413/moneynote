import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import {
  getRecentTransactions,
  getTransactionsByTypeInRange,
  addTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/db/repos/transactions'
import { sumAmount } from '@/db/repos/stats'
import type { Transaction } from '@/db/types'

export function useTransactions() {
  // 获取最近交易
  const recentTransactions = useLiveQuery(
    () => getRecentTransactions(10),
  ) || []

  // 添加交易
  const add = async (data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    return addTransaction(data)
  }

  // 更新交易
  const update = async (id: number, data: Partial<Transaction>) => {
    return updateTransaction(id, data)
  }

  // 删除交易
  const remove = async (id: number) => {
    await deleteTransaction(id)
  }

  // 今日支出(用本地日期,与交易 date 格式一致;原 toISOString 取 UTC,UTC+8 凌晨会误判为昨天)
  const todayExpense = useLiveQuery(async () => {
    const today = dayjs().format('YYYY-MM-DD')
    const txs = await getTransactionsByTypeInRange('expense', today, today)
    return sumAmount(txs)
  }) ?? 0

  // 本月支出(走 [type+date] 复合索引:单次索引查询替代全月 toArray + 前端 filter)
  const monthExpense = useLiveQuery(async () => {
    const start = dayjs().startOf('month').format('YYYY-MM-DD')
    const end = dayjs().endOf('month').format('YYYY-MM-DD')
    const txs = await getTransactionsByTypeInRange('expense', start, end)
    return sumAmount(txs)
  }) ?? 0

  // 本月收入(走 [type+date] 复合索引)
  const monthIncome = useLiveQuery(async () => {
    const start = dayjs().startOf('month').format('YYYY-MM-DD')
    const end = dayjs().endOf('month').format('YYYY-MM-DD')
    const txs = await getTransactionsByTypeInRange('income', start, end)
    return sumAmount(txs)
  }) ?? 0

  return {
    recentTransactions,
    addTransaction: add,
    updateTransaction: update,
    deleteTransaction: remove,
    todayExpense,
    monthExpense,
    monthIncome,
  }
}
