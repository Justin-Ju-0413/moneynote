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

  it('跨调用纯净性：extraKeywords 不污染内置词典（后续普通调用不受影响）', () => {
    // 带 extraKeywords 调用一次
    matchCategory('格林豪泰酒店', 'expense', { housing: ['格林豪泰', '汉庭'] })
    // 再不带 extraKeywords 调用：应仍命中内置"酒店"→ entertainment
    // 若实现浅拷贝后直接 push，housing 内置数组会被污染，这里会误判为 housing
    const r = matchCategory('格林豪泰酒店')
    expect(r.category).toBe('entertainment')
    expect(r.matchedKeyword).toBe('酒店')
  })

  it('extraKeywords 分类不存在时兜底 other', () => {
    const r = matchCategory('星巴克', 'expense', {})
    expect(r.category).toBe('food')
  })
})
