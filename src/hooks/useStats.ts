import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTransactionsByDateRange, getTransactionsByTypeInRange } from '@/db/repos/transactions'
import { computeRangeStats, getMonthCompareExpense } from '@/db/repos/stats'
import dayjs from 'dayjs'
import type { PeriodType } from '@/utils/constants'
import type { MonthCompareData } from '@/db/repos/stats'

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
      return getTransactionsByDateRange(start, end)
    },
    [dateRange[0], dateRange[1]],
    [],
  )

  const stats = useMemo(() => computeRangeStats(transactions), [transactions])

  // 上期（昨日/上月/去年）支出按分类：分类排行「较上期 ±%」箭头数据源，走 [type+date] 索引
  const previousDateRange = useMemo((): [string, string] => {
    switch (period) {
      case 'day': {
        const d = currentDate.subtract(1, 'day')
        return [d.format('YYYY-MM-DD'), d.format('YYYY-MM-DD')]
      }
      case 'month': {
        const m = currentDate.subtract(1, 'month')
        return [m.startOf('month').format('YYYY-MM-DD'), m.endOf('month').format('YYYY-MM-DD')]
      }
      case 'year': {
        const y = currentDate.subtract(1, 'year')
        return [y.startOf('year').format('YYYY-MM-DD'), y.endOf('year').format('YYYY-MM-DD')]
      }
    }
  }, [period, currentDate])

  const previousTransactions = useLiveQuery(
    async () => {
      const [start, end] = previousDateRange
      return getTransactionsByTypeInRange('expense', start, end)
    },
    [previousDateRange[0], previousDateRange[1]],
    [],
  )

  const previousByCategory = useMemo(
    () => computeRangeStats(previousTransactions).byCategory,
    [previousTransactions],
  )

  // 月环比/同比（仅月周期查询；其余周期返回 null 不渲染）
  const monthKey = currentDate.format('YYYY-MM')
  const monthCompare = useLiveQuery(
    async (): Promise<MonthCompareData | null> => {
      if (period !== 'month') return null
      const m = currentDate.startOf('month')
      const prev = m.subtract(1, 'month')
      const lastYear = m.subtract(1, 'year')
      return getMonthCompareExpense({
        current: [m.format('YYYY-MM-DD'), m.endOf('month').format('YYYY-MM-DD')],
        previous: [prev.startOf('month').format('YYYY-MM-DD'), prev.endOf('month').format('YYYY-MM-DD')],
        lastYear: [lastYear.startOf('month').format('YYYY-MM-DD'), lastYear.endOf('month').format('YYYY-MM-DD')],
      })
    },
    [period, monthKey],
    null,
  )

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
    previousByCategory,
    monthCompare,
    navigateDate,
    periodLabel,
  }
}
