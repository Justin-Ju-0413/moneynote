import { describe, it, expect } from 'vitest'
import { matchCategory } from './categoryMatcher'

describe('matchCategory extraKeywords', () => {
  it('extraKeywords 自定义关键词生效（内置词典未覆盖的词）', () => {
    const r = matchCategory('格林豪泰酒店', 'expense', { housing: ['格林豪泰', '汉庭'] })
    expect(r.category).toBe('housing')
    expect(r.confidence).toBe('high')
  })

  it('extraKeywords 不影响内置词典', () => {
    const r = matchCategory('打车15', 'expense', { housing: ['格林豪泰'] })
    expect(r.category).toBe('transport')
  })

  it('extraKeywords 分类不存在时兜底 other', () => {
    const r = matchCategory('星巴克', 'expense', {})
    expect(r.category).toBe('food')
  })
})
