import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import dayjs from 'dayjs'
import type { PeriodType } from '@/utils/constants'

export function useStats() {
  const [period, setPeriod] = useState<PeriodType>('month')
  const [currentDate, setCurrentDate] = useState(dayjs())

  const dateRange = useMemo((): [string, string] => {
    switch (period) {
      case 'day':
        return [currentDate.format('YYYY-MM-DD'), currentDate.format('YYYY-MM-DD')]
      case 'month':
        return [currentDate.startOf('month').format('YYYY-MM-DD'), currentDate.endOf('month').format('YYYY-MM-DD')]
      case 'year':
        return [currentDate.startOf('year').format('YYYY-MM-DD'), currentDate.endOf('year').format('YYYY-MM-DD')]
    }
  }, [period, currentDate])

  const transactions = useLiveQuery(
    async () => {
      const [start, end] = dateRange
      return db.transactions.where('date').between(start, end, true, true).toArray()
    },
    [dateRange[0], dateRange[1]],
    [],
  )

  const stats = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense')
    const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0)

    // 按分类统计
    const byCategory = expenses.reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount
      return acc
    }, {})

    // 按日期统计
    const byDate = expenses.reduce<Record<string, number>>((acc, t) => {
      acc[t.date] = (acc[t.date] || 0) + t.amount
      return acc
    }, {})

    return { totalExpense, byCategory, byDate, count: expenses.length }
  }, [transactions])

  const navigateDate = (direction: number) => {
    setCurrentDate(prev => {
      switch (period) {
        case 'day': return prev.add(direction, 'day')
        case 'month': return prev.add(direction, 'month')
        case 'year': return prev.add(direction, 'year')
      }
    })
  }

  const periodLabel = useMemo(() => {
    switch (period) {
      case 'day': return currentDate.format('M月D日')
      case 'month': return currentDate.format('YYYY年M月')
      case 'year': return currentDate.format('YYYY年')
    }
  }, [period, currentDate])

  return {
    period,
    setPeriod,
    currentDate,
    dateRange,
    stats,
    transactions,
    navigateDate,
    periodLabel,
  }
}
