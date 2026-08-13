import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTransactionsByDateRange } from '@/db/repos/transactions'
import { computeRangeStats } from '@/db/repos/stats'
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
      return getTransactionsByDateRange(start, end)
    },
    [dateRange[0], dateRange[1]],
    [],
  )

  const stats = useMemo(() => computeRangeStats(transactions), [transactions])

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
