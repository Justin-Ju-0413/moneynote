import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import { extractAmount } from './amountExtractor'
import { parseDate } from './dateParser'
import { cleanNote } from './noteCleaner'
import { matchCategory } from './categoryMatcher'

describe('extractAmount', () => {
  it('数字+元', () => {
    const r = extractAmount('午餐35元')
    expect(r.amount).toBe(35)
    expect(r.confidence).toBe('high')
    expect(r.matchedText).toBe('35元')
  })

  it('动词+数字:matchedText 仅数字保留助词', () => {
    const r = extractAmount('午餐吃了34')
    expect(r.amount).toBe(34)
    expect(r.matchedText).toBe('34')
  })

  it('货币符号', () => {
    const r = extractAmount('¥30咖啡')
    expect(r.amount).toBe(30)
    expect(r.matchedText).toBe('¥30')
  })

  it('末尾数字', () => {
    const r = extractAmount('咖啡12.5')
    expect(r.amount).toBe(12.5)
    expect(r.confidence).toBe('medium')
  })

  it('无数字返回 null 低置信度', () => {
    const r = extractAmount('今天天气不错')
    expect(r.amount).toBeNull()
    expect(r.confidence).toBe('low')
    expect(r.matchedText).toBe('')
  })

  it('金额为 0 时忽略', () => {
    const r = extractAmount('免费')
    expect(r.amount).toBeNull()
  })
})

describe('parseDate', () => {
  it('ISO 格式 YYYY-MM-DD', () => {
    const r = parseDate('2026-07-01 午餐')
    expect(r.date).toBe('2026-07-01')
  })

  it('X月X日', () => {
    const r = parseDate('7月15日 午饭')
    expect(r.date).toBe(dayjs().month(6).date(15).format('YYYY-MM-DD'))
  })

  it('昨天', () => {
    const r = parseDate('昨天的咖啡')
    expect(r.date).toBe(dayjs().subtract(1, 'day').format('YYYY-MM-DD'))
  })

  it('N天前', () => {
    const r = parseDate('3天前的午餐')
    expect(r.date).toBe(dayjs().subtract(3, 'day').format('YYYY-MM-DD'))
  })

  it('时间 HH:mm', () => {
    const r = parseDate('8:30 早餐')
    expect(r.time).toBe('08:30')
  })

  it('无日期默认今天', () => {
    const r = parseDate('午餐')
    expect(r.date).toBe(dayjs().format('YYYY-MM-DD'))
    expect(r.matchedText).toBe('')
  })
})

describe('cleanNote', () => {
  it('移除日期与金额词', () => {
    expect(cleanNote('2026-07-01 午餐35元', '2026-07-01', '35元')).toBe('午餐')
  })

  it('移除动词前缀', () => {
    expect(cleanNote('花了28元吃饭', '', '28元')).toBe('吃饭')
  })

  it('清理首尾标点', () => {
    expect(cleanNote('，午餐35元。', '', '35元')).toBe('午餐')
  })

  it('折叠多余空白', () => {
    expect(cleanNote('午餐  35元 咖啡', '', '35元')).toBe('午餐 咖啡')
  })
})

describe('matchCategory', () => {
  it('支出关键词命中 transport', () => {
    const r = matchCategory('打车去公司', 'expense')
    expect(r.category).toBe('transport')
    expect(r.confidence).toBe('high')
  })

  it('收入关键词命中 salary', () => {
    const r = matchCategory('工资到账', 'income')
    expect(r.category).toBe('salary')
    expect(r.confidence).toBe('high')
  })

  it('无命中回退 other 低置信度', () => {
    const r = matchCategory('xyzabc', 'expense')
    expect(r.category).toBe('other')
    expect(r.confidence).toBe('low')
  })
})
