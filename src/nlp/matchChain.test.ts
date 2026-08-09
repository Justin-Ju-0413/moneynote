import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/db'
import { recordLearning } from './learningRules'
import { classifyWithChain, buildKeywordDict } from './matchChain'
import { defaultCategories } from '@/db/seed'

beforeEach(async () => {
  await db.learningRules.clear()
  await db.categories.clear()
  await db.categories.bulkPut(defaultCategories)
})

describe('buildKeywordDict', () => {
  it('返回按分类聚合的关键词字典', async () => {
    await db.categories.update('housing', { keywords: ['格林豪泰', '汉庭'] })
    const dict = await buildKeywordDict('expense')
    expect(dict.housing).toContain('格林豪泰')
    expect(dict.food).toBeDefined()
  })
})

describe('classifyWithChain', () => {
  it('学习规则命中优先（返回 high + rule）', async () => {
    await recordLearning('格林豪泰', 'housing', 'manual', 1)
    const r = await classifyWithChain('格林豪泰酒店', 'expense')
    expect(r.category).toBe('housing')
    expect(r.confidence).toBe('high')
    expect(r.rule?.source).toBe('manual')
  })

  it('无规则时走自定义关键词', async () => {
    await db.categories.update('housing', { keywords: ['格林豪泰'] })
    const r = await classifyWithChain('格林豪泰酒店', 'expense')
    expect(r.category).toBe('housing')
    expect(r.confidence).toBe('high')
    expect(r.rule).toBeUndefined()
  })

  it('无规则无关键词时走内置词典', async () => {
    const r = await classifyWithChain('打车15', 'expense')
    expect(r.category).toBe('transport')
  })

  it('完全未命中返回 low + other', async () => {
    const r = await classifyWithChain('xqpqz未知商户', 'expense')
    expect(r.category).toBe('other')
    expect(r.confidence).toBe('low')
  })
})
