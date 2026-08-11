import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/db'
import { recordLearning, matchLearningRule, listLearningRules, exportLearningRules, importLearningRules } from './learningRules'

beforeEach(async () => {
  await db.learningRules.clear()
})

describe('exportLearningRules', () => {
  it('导出 JSON 包含全部规则与元信息', async () => {
    await recordLearning('格林豪泰', 'housing', 'manual', 1)
    await recordLearning('美团', 'food', 'llm', 0.9)
    const json = await exportLearningRules()
    const payload = JSON.parse(json)
    expect(payload.version).toBe(1)
    expect(payload.exportedAt).toBeGreaterThan(0)
    expect(payload.rules).toHaveLength(2)
    expect(payload.rules.map((r: { merchant: string }) => r.merchant).sort())
      .toEqual(['格林豪泰', '美团'])
  })
})

describe('importLearningRules', () => {
  it('roundtrip 保真：导出 → 清空 → 导入 → 字段一致', async () => {
    await recordLearning('格林豪泰', 'housing', 'manual', 1)
    const before = (await matchLearningRule('格林豪泰'))!
    await db.learningRules.update(before.id!, { matchCount: 5, lastHitAt: 1234567890 })

    const json = await exportLearningRules()
    await db.learningRules.clear()
    const { imported, skipped } = await importLearningRules(json)

    expect(imported).toBe(1)
    expect(skipped).toBe(0)
    const after = (await matchLearningRule('格林豪泰'))!
    expect(after.merchant).toBe('格林豪泰')
    expect(after.category).toBe('housing')
    expect(after.source).toBe('manual')
    expect(after.hitCount).toBe(1)
    expect(after.matchCount).toBe(5)
    expect(after.lastHitAt).toBe(1234567890)
  })

  it('已存在的 merchant 跳过（不覆盖本地新规则）', async () => {
    await recordLearning('格林豪泰', 'housing', 'manual', 1)
    const payload = {
      version: 1,
      exportedAt: Date.now(),
      rules: [
        { merchant: '格林豪泰', category: 'food', source: 'manual', hitCount: 1, confidence: 1, createdAt: 1, updatedAt: 1 },
        { merchant: '如家', category: 'housing', source: 'manual', hitCount: 1, confidence: 1, createdAt: 1, updatedAt: 1 },
      ],
    }
    const { imported, skipped } = await importLearningRules(JSON.stringify(payload))
    expect(imported).toBe(1)
    expect(skipped).toBe(1)
    // 本地规则未被覆盖
    const local = (await matchLearningRule('格林豪泰'))!
    expect(local.category).toBe('housing')
  })

  it('非法 JSON 抛错', async () => {
    await expect(importLearningRules('not json{{{')).rejects.toThrow('不是有效的 JSON')
  })

  it('版本不符抛错', async () => {
    await expect(importLearningRules(JSON.stringify({ version: 2, rules: [] }))).rejects.toThrow('不支持的导入文件版本')
  })

  it('非法行跳过（缺字段/非法 source），计数正确', async () => {
    const payload = {
      version: 1,
      exportedAt: Date.now(),
      rules: [
        { merchant: '', category: 'food', source: 'manual' },            // 空 merchant
        { merchant: 'A', category: '', source: 'manual' },               // 空 category
        { merchant: 'B', category: 'food', source: 'hacker' },           // 非法 source
        { merchant: 'C', category: 'food', source: 'llm', confidence: 0.9 }, // 合法
      ],
    }
    const { imported, skipped } = await importLearningRules(JSON.stringify(payload))
    expect(imported).toBe(1)
    expect(skipped).toBe(3)
    expect(await listLearningRules()).toHaveLength(1)
  })
})
