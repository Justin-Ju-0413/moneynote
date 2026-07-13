import type { Transaction } from '@/db/types'
import { CATEGORY_MAP } from './constants'

export function exportToCSV(transactions: Transaction[]): string {
  const header = '日期,时间,类型,分类,金额,备注\n'
  const rows = transactions.map((t) => {
    const cat = CATEGORY_MAP[t.category]?.name || t.category
    const type = t.type === 'expense' ? '支出' : '收入'
    const note = (t.note || '').replace(/,/g, '，')
    return `${t.date},${t.time || ''},${type},${cat},${t.amount},${note}`
  })
  return header + rows.join('\n')
}

export function exportToJSON(transactions: Transaction[]): string {
  return JSON.stringify(transactions, null, 2)
}

export function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
