import { describe, it, expect } from 'vitest'
import { exportToCSV, exportToJSON, EXPORT_SCHEMA_VERSION } from './export'
import type { Transaction } from '@/db/types'

function makeTx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    date: '2026-07-15',
    time: '12:00:00',
    type: 'expense',
    category: 'food',
    amount: 12.5,
    note: '午餐',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

describe('exportToCSV', () => {
  it('带 UTF-8 BOM 让 Excel 正确识别编码', () => {
    const csv = exportToCSV([makeTx()])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('使用 CRLF 换行(RFC 4180)', () => {
    const csv = exportToCSV([makeTx()])
    expect(csv).toContain('\r\n')
    // 无字段内换行时,不应出现裸 \n(每个 \n 都由 \r 起头)
    expect(csv).not.toMatch(/[^\r]\n/)
  })

  it('包含表头', () => {
    const csv = exportToCSV([])
    expect(csv).toContain('日期,时间,类型,分类,金额,备注')
  })

  it('备注含逗号时用双引号包裹,逗号保留', () => {
    const csv = exportToCSV([makeTx({ note: '苹果,香蕉' })])
    expect(csv).toContain('"苹果,香蕉"')
  })

  it('备注含双引号时双写转义', () => {
    const csv = exportToCSV([makeTx({ note: '说"嗨"' })])
    expect(csv).toContain('"说""嗨"""')
  })

  it('备注含换行时用双引号包裹', () => {
    const csv = exportToCSV([makeTx({ note: '第一行\n第二行' })])
    expect(csv).toContain('"第一行\n第二行"')
  })
})

describe('exportToJSON', () => {
  it('包含 schemaVersion / app / transactions', () => {
    const txs = [makeTx(), makeTx({ id: 2, note: '打车' })]
    const json = exportToJSON(txs)
    const parsed = JSON.parse(json)
    expect(parsed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION)
    expect(parsed.app).toBe('MoneyNote')
    expect(typeof parsed.exportedAt).toBe('string')
    expect(parsed.transactions).toHaveLength(2)
    expect(parsed.transactions[0].note).toBe('午餐')
    expect(parsed.transactions[1].note).toBe('打车')
  })

  it('schemaVersion 为正整数,供未来迁移判断', () => {
    expect(EXPORT_SCHEMA_VERSION).toBeGreaterThan(0)
  })
})
