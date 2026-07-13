import dayjs from 'dayjs'

export function getTodayRange(): [string, string] {
  const today = dayjs().format('YYYY-MM-DD')
  return [today, today]
}

export function getMonthRange(date?: dayjs.Dayjs): [string, string] {
  const d = date || dayjs()
  return [d.startOf('month').format('YYYY-MM-DD'), d.endOf('month').format('YYYY-MM-DD')]
}

export function getYearRange(date?: dayjs.Dayjs): [string, string] {
  const d = date || dayjs()
  return [d.startOf('year').format('YYYY-MM-DD'), d.endOf('year').format('YYYY-MM-DD')]
}

export function getWeekRange(date?: dayjs.Dayjs): [string, string] {
  const d = date || dayjs()
  return [d.startOf('week').format('YYYY-MM-DD'), d.endOf('week').format('YYYY-MM-DD')]
}

export function getDaysInMonth(date?: dayjs.Dayjs): number {
  const d = date || dayjs()
  return d.daysInMonth()
}

export function isToday(date: string): boolean {
  return dayjs(date).isSame(dayjs(), 'day')
}

export function isThisMonth(date: string): boolean {
  return dayjs(date).isSame(dayjs(), 'month')
}
