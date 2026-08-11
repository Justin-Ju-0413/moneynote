import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/db'
import { recordLearning, matchLearningRule, listLearningRules, deleteLearningRule, recordRuleHit, cleanupColdRules, revokeKeyword } from './learningRules'
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

  it('剥离分类后缀取核心词（汉庭酒店住宿 → 汉庭）', async () => {
    await db.categories.bulkPut(defaultCategories.filter(c => c.id === 'housing'))
    const ok = await promoteToKeyword({
      id: 1, merchant: '汉庭酒店住宿', category: 'housing', source: 'manual',
      hitCount: 1, confidence: 1, createdAt: 1, updatedAt: 1,
    })
    expect(ok).toBe(true)
    const cat = await db.categories.get('housing')
    expect(cat!.keywords).toContain('汉庭')
    expect(cat!.keywords).not.toContain('汉庭酒店住宿')
  })

  it('无后缀 merchant 原样提炼（瑞幸）', async () => {
    await db.categories.bulkPut(defaultCategories.filter(c => c.id === 'food'))
    const ok = await promoteToKeyword({
      id: 1, merchant: '瑞幸', category: 'food', source: 'manual',
      hitCount: 1, confidence: 1, createdAt: 1, updatedAt: 1,
    })
    expect(ok).toBe(true)
    const cat = await db.categories.get('food')
    expect(cat!.keywords).toContain('瑞幸')
  })

  it('剥完只剩后缀词本身不提炼（酒店/民宿）', async () => {
    await db.categories.bulkPut(defaultCategories.filter(c => c.id === 'housing'))
    const before = (await db.categories.get('housing'))!.keywords
    const base = { id: 1, category: 'housing' as const, source: 'manual' as const, confidence: 1, createdAt: 1, updatedAt: 1, hitCount: 1 }
    expect(await promoteToKeyword({ ...base, merchant: '酒店' })).toBe(false)
    expect(await promoteToKeyword({ ...base, merchant: '民宿' })).toBe(false)
    const cat = await db.categories.get('housing')
    expect(cat!.keywords).toHaveLength(before.length)
    expect(cat!.keywords).not.toContain('酒店')
    expect(cat!.keywords).not.toContain('民宿')
  })

  it('剥离后剩余 <2 字不提炼（大饭店 → 大）', async () => {
    await db.categories.bulkPut(defaultCategories.filter(c => c.id === 'food'))
    const before = (await db.categories.get('food'))!.keywords
    const ok = await promoteToKeyword({
      id: 1, merchant: '大饭店', category: 'food', source: 'manual',
      hitCount: 1, confidence: 1, createdAt: 1, updatedAt: 1,
    })
    expect(ok).toBe(false)
    const cat = await db.categories.get('food')
    expect(cat!.keywords).toHaveLength(before.length)
    expect(cat!.keywords).not.toContain('大饭店')
  })
})

describe('recordRuleHit（B3 命中计量）', () => {
  it('命中后 matchCount 累加、lastHitAt 更新', async () => {
    await recordLearning('格林豪泰', 'housing', 'manual', 1)
    let rule = (await matchLearningRule('格林豪泰'))!
    expect(rule.matchCount).toBeUndefined()

    await recordRuleHit(rule)
    rule = (await matchLearningRule('格林豪泰'))!
    expect(rule.matchCount).toBe(1)
    expect(rule.lastHitAt).toBeGreaterThan(0)

    await recordRuleHit(rule)
    rule = (await matchLearningRule('格林豪泰'))!
    expect(rule.matchCount).toBe(2)
  })

  it('matchCount 起始为 0（?? 兜底，不产生 NaN）', async () => {
    await recordLearning('如家', 'housing', 'manual', 1)
    const rule = (await matchLearningRule('如家'))!
    await recordRuleHit(rule)
    const after = (await matchLearningRule('如家'))!
    expect(after.matchCount).toBe(1)
  })
})

describe('revokeKeyword / 删除撤回（B2）', () => {
  beforeEach(async () => {
    await db.categories.bulkPut(defaultCategories.filter(c => ['housing', 'food'].includes(c.id)))
  })

  it('deleteLearningRule 撤回已提炼的关键词', async () => {
    await recordLearning('格林豪泰', 'housing', 'manual', 1)
    let cat = await db.categories.get('housing')
    expect(cat!.keywords).toContain('格林豪泰')

    const rule = (await matchLearningRule('格林豪泰'))!
    await deleteLearningRule(rule.id!)
    cat = await db.categories.get('housing')
    expect(cat!.keywords).not.toContain('格林豪泰')
    expect(await listLearningRules()).toHaveLength(0)
  })

  it('manual 改判：撤回旧分类关键词 + 新分类提炼', async () => {
    await recordLearning('如家', 'housing', 'manual', 1)
    await recordLearning('如家', 'food', 'manual', 1)

    const rule = (await matchLearningRule('如家'))!
    expect(rule.category).toBe('food')
    expect(rule.hitCount).toBe(1)
    const housing = await db.categories.get('housing')
    expect(housing!.keywords).not.toContain('如家')
    const food = await db.categories.get('food')
    expect(food!.keywords).toContain('如家')
  })

  it('llm→manual 升级时 hitCount 重置为 1', async () => {
    await recordLearning('星巴克', 'food', 'llm', 0.9)
    await recordLearning('星巴克', 'food', 'manual', 1)
    const rule = (await matchLearningRule('星巴克'))!
    expect(rule.source).toBe('manual')
    expect(rule.hitCount).toBe(1)
  })

  it('revokeKeyword：分类无该词时 noop（返回 false）', async () => {
    await recordLearning('美团', 'food', 'manual', 1)
    const rule = (await matchLearningRule('美团'))!
    const ok = await revokeKeyword({ ...rule, category: 'housing' }) // 词在 food，不在 housing
    expect(ok).toBe(false)
  })
})

describe('cleanupColdRules（B2 冷规则清理）', () => {
  beforeEach(async () => {
    await db.categories.bulkPut(defaultCategories.filter(c => c.id === 'housing'))
  })

  it('删除 lastHitAt 早于 180 天的规则', async () => {
    await recordLearning('格林豪泰', 'housing', 'manual', 1)
    const rule = (await matchLearningRule('格林豪泰'))!
    await db.learningRules.update(rule.id!, { lastHitAt: Date.now() - 200 * 24 * 60 * 60 * 1000 })

    const removed = await cleanupColdRules(180)
    expect(removed).toBe(1)
    expect(await listLearningRules()).toHaveLength(0)
  })

  it('保留新命中与无 lastHitAt 的旧数据（保守）', async () => {
    await recordLearning('格林豪泰', 'housing', 'manual', 1)
    await recordLearning('如家', 'housing', 'manual', 1)
    const fresh = (await matchLearningRule('格林豪泰'))!
    await db.learningRules.update(fresh.id!, { lastHitAt: Date.now() - 1 * 24 * 60 * 60 * 1000 })
    // 如家：无 lastHitAt（旧数据形态），不删

    const removed = await cleanupColdRules(180)
    expect(removed).toBe(0)
    expect(await listLearningRules()).toHaveLength(2)
  })
})
