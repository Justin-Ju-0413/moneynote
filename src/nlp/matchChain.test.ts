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

  it('渠道前缀规则命中：规则「财付通-美团」可命中输入「美团外卖」', async () => {
    await recordLearning('财付通-美团', 'food', 'llm', 0.9)
    const r = await classifyWithChain('美团外卖', 'expense')
    expect(r.category).toBe('food')
    expect(r.confidence).toBe('high')
    expect(r.rule?.merchant).toBe('财付通-美团')
  })

  it('单字规则不参与包含匹配（防误命中）', async () => {
    await recordLearning('餐', 'food', 'manual', 1)
    const r = await classifyWithChain('早餐店', 'expense')
    // 单字规则被排除 → 走关键词匹配（内置词典），不命中 '餐' 规则
    expect(r.rule).toBeUndefined()
  })

  it('命中后计量 matchCount/lastHitAt 更新', async () => {
    await recordLearning('格林豪泰', 'housing', 'manual', 1)
    const ruleBefore = await db.learningRules.where('merchant').equals('格林豪泰').first()
    expect(ruleBefore?.matchCount).toBeUndefined()
    await classifyWithChain('格林豪泰酒店', 'expense')
    const ruleAfter = await db.learningRules.where('merchant').equals('格林豪泰').first()
    expect(ruleAfter?.matchCount).toBe(1)
    expect(ruleAfter?.lastHitAt).toBeGreaterThan(0)
  })

  it('包含匹配按核心词长度优先（取最长规则）', async () => {
    await recordLearning('星巴克', 'food', 'manual', 1)
    await recordLearning('星巴克咖啡', 'shopping', 'llm', 0.9)
    const r = await classifyWithChain('星巴克咖啡店', 'expense')
    expect(r.rule?.merchant).toBe('星巴克咖啡')
    expect(r.category).toBe('shopping')
  })
})
