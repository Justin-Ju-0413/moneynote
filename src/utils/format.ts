import dayjs from 'dayjs'

export function formatAmount(amount: number): string {
  return `¥${amount.toFixed(2)}`
}

export function formatAmountShort(amount: number): string {
  if (amount >= 10000) {
    return `¥${(amount / 10000).toFixed(1)}w`
  }
  return `¥${amount.toFixed(0)}`
}

export function formatDate(date: string | Date): string {
  const d = dayjs(date)
  const today = dayjs().startOf('day')
  const yesterday = today.subtract(1, 'day')

  if (d.isSame(today, 'day')) return '今天'
  if (d.isSame(yesterday, 'day')) return '昨天'
  if (d.isSame(today, 'year')) return d.format('M月D日')
  return d.format('YYYY年M月D日')
}

export function formatTime(time: string): string {
  return time
}
