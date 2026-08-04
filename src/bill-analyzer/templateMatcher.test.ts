import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { matchTemplate, updateTemplateUsage, saveTemplate, deleteTemplate, getAllTemplates } from './templateMatcher'
import { generateFingerprint } from './analyzer'
import type { BillTemplate, ColumnMapping } from '@/db/types'

const HEADERS = ['交易时间', '交易分类', '交易对方', '商品说明', '收/支', '金额', '交易状态']

const BASE_MAPPINGS: ColumnMapping[] = [
  { columnIndex: 0, originalHeader: '交易时间', normalizedHeader: '交易时间', role: 'date' },
  { columnIndex: 1, originalHeader: '交易分类', normalizedHeader: '交易分类', role: 'category' },
  { columnIndex: 2, originalHeader: '交易对方', normalizedHeader: '交易对方', role: 'counterparty' },
  { columnIndex: 3, originalHeader: '商品说明', normalizedHeader: '商品说明', role: 'note' },
  { columnIndex: 4, originalHeader: '收/支', normalizedHeader: '收/支', role: 'direction' },
  { columnIndex: 5, originalHeader: '金额', normalizedHeader: '金额', role: 'amount' },
  { columnIndex: 6, originalHeader: '交易状态', normalizedHeader: '交易状态', role: 'status' },
]

function makeTemplate(overrides: Partial<BillTemplate> = {}): Omit<BillTemplate, 'id'> {
  return {
    fingerprint: '', name: '测试模板', source: 'alipay', isBuiltIn: false,
    fileType: 'csv', encoding: 'gbk', headerRowIndex: -1, columnMappings: BASE_MAPPINGS,
    importCount: 0, createdAt: 0, updatedAt: 0,
    ...overrides,
  }
}

describe('templateMatcher', () => {
  beforeEach(async () => {
    await db.billTemplates.clear()
  })

  it('detectedSource 命中内置模板(builtin),headerRowIndex 用指纹的', async () => {
    const fp = generateFingerprint('csv', 'utf-8', 0, HEADERS)
    const r = await matchTemplate(fp, 'alipay')
    expect(r.matchType).toBe('builtin')
    expect(r.template?.source).toBe('alipay')
    expect(r.template?.headerRowIndex).toBe(0)
    expect(r.similarity).toBe(1)
  })

  it('自定义模板按 headerHash 精确匹配(exact)', async () => {
    const fp = generateFingerprint('csv', 'utf-8', 0, HEADERS)
    await saveTemplate(makeTemplate({ fingerprint: fp.headerHash }))
    const r = await matchTemplate(fp)
    expect(r.matchType).toBe('exact')
    expect(r.template?.name).toBe('测试模板')
  })

  it('列一致 + Jaccard≥0.8 时模糊匹配(fuzzy)', async () => {
    const fp = generateFingerprint('csv', 'utf-8', 0, HEADERS)
    await saveTemplate(makeTemplate({ fingerprint: 'other-hash' }))
    const r = await matchTemplate(fp)
    expect(r.matchType).toBe('fuzzy')
    expect(r.similarity).toBeGreaterThanOrEqual(0.8)
  })

  it('相似度不足 0.8 时不模糊匹配', async () => {
    const fp = generateFingerprint('csv', 'utf-8', 0, HEADERS)
    const poorMappings = BASE_MAPPINGS.map((m, i) =>
      i === 6 ? { ...m, normalizedHeader: '完全无关列' } : m,
    )
    await saveTemplate(makeTemplate({ fingerprint: 'other-hash', columnMappings: poorMappings }))
    const r = await matchTemplate(fp)
    expect(r.matchType).toBe('none')
    expect(r.template).toBeNull()
  })

  it('无匹配时返回 none', async () => {
    const fp = generateFingerprint('csv', 'utf-8', 0, ['a', 'b', 'c'])
    const r = await matchTemplate(fp)
    expect(r.matchType).toBe('none')
  })

  it('updateTemplateUsage 递增 importCount 并记 lastUsedAt', async () => {
    const id = await saveTemplate(makeTemplate({ importCount: 0 }))
    const t = (await db.billTemplates.get(id))!
    await updateTemplateUsage(t)
    const updated = (await db.billTemplates.get(id))!
    expect(updated.importCount).toBe(1)
    expect(updated.lastUsedAt).toBeDefined()
  })

  it('deleteTemplate 禁止删除内置模板', async () => {
    const id = await db.billTemplates.add(makeTemplate({ isBuiltIn: true }))
    await expect(deleteTemplate(id as number)).rejects.toThrow('不能删除内置模板')
  })

  it('deleteTemplate 可删除自定义模板', async () => {
    const id = await saveTemplate(makeTemplate())
    await deleteTemplate(id)
    expect(await db.billTemplates.get(id)).toBeUndefined()
  })

  it('getAllTemplates 按 importCount 倒序', async () => {
    await saveTemplate(makeTemplate({ name: '低', importCount: 1 }))
    await saveTemplate(makeTemplate({ name: '高', importCount: 5 }))
    const list = await getAllTemplates()
    expect(list[0].name).toBe('高')
  })
})
