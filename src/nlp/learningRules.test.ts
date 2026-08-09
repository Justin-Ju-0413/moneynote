import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/db'
import { recordLearning, matchLearningRule, listLearningRules, deleteLearningRule } from './learningRules'
import { promoteToKeyword, stripChannelPrefix } from './learningRules'
import { defaultCategories } from '@/db/seed'

beforeEach(async () => {
  await db.learningRules.clear()
  await db.categories.clear()
})

describe('recordLearning 优先级', () => {
  it('llm 先写入，manual 后写入覆盖为 manual', async () => {
    await recordLearning('星巴克', 'food', 'llm', 0.9)
    await recordLearning('星巴克', 'food', 'manual', 1)
    const rule = await matchLearningRule('星巴克')
    expect(rule?.source).toBe('manual')
  })

  it('manual 已存在时 llm 不覆盖且 hitCount 不重复累加', async () => {
    await recordLearning('星巴克', 'food', 'manual', 1)
    await recordLearning('星巴克', 'food', 'llm', 0.9)
    const rule = await matchLearningRule('星巴克')
    expect(rule?.source).toBe('manual')
    expect(rule?.hitCount).toBe(1)
  })

  it('llm 已存在时再次 llm 累加 hitCount', async () => {
    await recordLearning('美团', 'food', 'llm', 0.8)
    await recordLearning('美团', 'food', 'llm', 0.9)
    const rule = await matchLearningRule('美团')
    expect(rule?.hitCount).toBe(2)
  })

  it('manual 已存在时再次 manual 累加 hitCount', async () => {
    await recordLearning('打车', 'transport', 'manual', 1)
    await recordLearning('打车', 'transport', 'manual', 1)
    const rule = await matchLearningRule('打车')
    expect(rule?.hitCount).toBe(2)
  })
})

describe('matchLearningRule', () => {
  it('未命中返回 null', async () => {
    expect(await matchLearningRule('不存在商户')).toBeNull()
  })
})

describe('list / delete', () => {
  it('列表与删除', async () => {
    await recordLearning('A', 'food', 'llm', 0.9)
    await recordLearning('B', 'transport', 'manual', 1)
    expect(await listLearningRules()).toHaveLength(2)
    const rule = await matchLearningRule('A')
    await deleteLearningRule(rule!.id!)
    expect(await listLearningRules()).toHaveLength(1)
  })
})

describe('stripChannelPrefix', () => {
  it('剔除渠道前缀', () => {
    expect(stripChannelPrefix('银联渠道他代本借记卡无卡交易格林豪泰')).toBe('格林豪泰')
    expect(stripChannelPrefix('财付通-美团')).toBe('美团')
    expect(stripChannelPrefix('普通文本')).toBe('普通文本')
  })
})

describe('promoteToKeyword', () => {
  it('manual 1 次即提炼（≥2 字）', async () => {
    await db.categories.bulkPut(defaultCategories.filter(c => c.id === 'housing'))
    const ok = await promoteToKeyword({
      id: 1, merchant: '格林豪泰', category: 'housing', source: 'manual',
      hitCount: 1, confidence: 1, createdAt: 1, updatedAt: 1,
    })
    expect(ok).toBe(true)
    const cat = await db.categories.get('housing')
    expect(cat!.keywords).toContain('格林豪泰')
  })

  it('llm 2 次不提炼，3 次提炼', async () => {
    await db.categories.bulkPut(defaultCategories.filter(c => c.id === 'housing'))
    const base = { id: 1, merchant: '如家', category: 'housing', source: 'llm' as const, confidence: 0.9, createdAt: 1, updatedAt: 1 }
    expect(await promoteToKeyword({ ...base, hitCount: 2 })).toBe(false)
    expect(await promoteToKeyword({ ...base, hitCount: 3 })).toBe(true)
  })

  it('单字不提炼、重复不重复写', async () => {
    await db.categories.bulkPut(defaultCategories.filter(c => c.id === 'food'))
    const base = { id: 1, merchant: '餐', category: 'food', source: 'manual' as const, confidence: 1, createdAt: 1, updatedAt: 1, hitCount: 1 }
    expect(await promoteToKeyword(base)).toBe(false)
    const cat = await db.categories.get('food')
    const len = cat!.keywords.length
    const ok = await promoteToKeyword({ ...base, merchant: '豆浆' })
    expect(ok).toBe(true)
    const cat2 = await db.categories.get('food')
    expect(cat2!.keywords).toHaveLength(len + 1)
    const ok2 = await promoteToKeyword({ ...base, merchant: '豆浆' })
    expect(ok2).toBe(false)
    expect(cat2!.keywords).toHaveLength(len + 1)
  })
})
