import { describe, it, expect } from 'vitest'
import { parseInput, extractAmount, cleanNote } from './index'

// 备注清理回归:金额提取的 matchedText 边界曾吞掉助词"了",
// 导致"午餐吃了34"备注变成"午餐吃"。这里锁定修复行为。
describe('parseInput 备注(note)清理', () => {
  it('"午餐吃了34" 保留助词"了"', () => {
    expect(parseInput('午餐吃了34').note).toBe('午餐吃了')
  })

  it('"打车去公司花了28块" 保留"了"(块 normalize 为元)', () => {
    expect(parseInput('打车去公司花了28块').note).toBe('打车去公司花了')
  })

  it('"午餐吃了34元" 保留"了"、移除"34元"', () => {
    expect(parseInput('午餐吃了34元').note).toBe('午餐吃了')
  })

  it('"咖啡25" 保留描述', () => {
    expect(parseInput('咖啡25').note).toBe('咖啡')
  })

  it('"¥30咖啡" 移除金额保留描述', () => {
    expect(parseInput('¥30咖啡').note).toBe('咖啡')
  })
})

describe('extractAmount matchedText 边界', () => {
  it('动词+数字:matchedText 仅数字,不含助词"了"', () => {
    const r = extractAmount('午餐吃了34')
    expect(r.amount).toBe(34)
    expect(r.matchedText).toBe('34')
  })

  it('数字+元:matchedText 含金额+单位', () => {
    const r = extractAmount('打车去公司花了28元')
    expect(r.amount).toBe(28)
    expect(r.matchedText).toBe('28元')
  })

  it('货币符号:matchedText 含符号+数字', () => {
    const r = extractAmount('¥30咖啡')
    expect(r.amount).toBe(30)
    expect(r.matchedText).toBe('¥30')
  })
})

describe('cleanNote', () => {
  it('删除金额数字时保留助词"了"', () => {
    expect(cleanNote('午餐吃了34', '', '34')).toBe('午餐吃了')
  })

  it('删除金额+单位', () => {
    expect(cleanNote('打车去公司花了28元', '', '28元')).toBe('打车去公司花了')
  })
})
