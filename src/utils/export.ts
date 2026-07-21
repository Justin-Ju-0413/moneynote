import type { Transaction } from '@/db/types'
import { CATEGORY_MAP } from './constants'

export const EXPORT_SCHEMA_VERSION = 1

const UTF8_BOM = String.fromCharCode(0xfeff)

/** 将字段按 RFC 4180 转义:含逗号/引号/换行时用双引号包裹,内部引号双写 */
function csvField(value: string | number | undefined | null): string {
  const s = value === undefined || value === null ? '' : String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function exportToCSV(transactions: Transaction[], categoryMap: Record<string, string> = {}): string {
  const header = ['日期', '时间', '类型', '分类', '金额', '备注']
  const lines = [header.map(csvField).join(',')]
  for (const t of transactions) {
    const cat = categoryMap[t.category] || CATEGORY_MAP[t.category]?.name || t.category
    const type = t.type === 'expense' ? '支出' : '收入'
    const row = [t.date, t.time || '', type, cat, t.amount, t.note || '']
    lines.push(row.map(csvField).join(','))
  }
  // BOM 让 Excel 正确识别 UTF-8;CRLF 符合 RFC 4180
  return UTF8_BOM + lines.join('\r\n') + '\r\n'
}

export function exportToJSON(transactions: Transaction[]): string {
  const payload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    app: 'MoneyNote',
    exportedAt: new Date().toISOString(),
    transactions,
  }
  return JSON.stringify(payload, null, 2)
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
