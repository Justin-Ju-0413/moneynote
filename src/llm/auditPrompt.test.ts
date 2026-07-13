import { describe, it, expect } from 'vitest'
import { parseAuditSuggestions, buildAuditSystemPrompt } from './auditPrompt'
import type { AuditTask } from './types'

describe('parseAuditSuggestions', () => {
  it('解析合法建议并按任务过滤类型', () => {
    const content = JSON.stringify({
      suggestions: [
        { type: 'category', transactionIds: [1], result: 'food', confidence: 0.9, reason: '商户匹配' },
        { type: 'anomaly', transactionIds: [2], result: '大额', confidence: 0.7, reason: '超 1000' },
      ],
    })
    // categorize 任务只允许 category
    const cat = parseAuditSuggestions(content, 'categorize')
    expect(cat).toHaveLength(1)
    expect(cat[0].type).toBe('category')
    expect(cat[0].result).toBe('food')
    expect(cat[0].task).toBe('categorize')
    expect(cat[0].status).toBe('pending')

    // audit 任务允许 category + anomaly
    const audit = parseAuditSuggestions(content, 'audit')
    expect(audit).toHaveLength(2)
  })

  it('dedupe 任务过滤掉非 duplicate 类型', () => {
    const content = JSON.stringify({
      suggestions: [
        { type: 'duplicate', transactionIds: [1, 2], result: '疑似重复', confidence: 0.8, reason: '同日同额' },
        { type: 'category', transactionIds: [1], result: 'food', confidence: 0.9, reason: '' },
      ],
    })
    const dup = parseAuditSuggestions(content, 'dedupe')
    expect(dup).toHaveLength(1)
    expect(dup[0].type).toBe('duplicate')
  })

  it('非法 JSON 返回空数组', () => {
    expect(parseAuditSuggestions('not json', 'audit')).toEqual([])
  })

  it('缺失字段使用默认值', () => {
    const content = JSON.stringify({ suggestions: [{ type: 'summary' }] })
    const s = parseAuditSuggestions(content, 'analyzeMonth')
    expect(s).toHaveLength(1)
    expect(s[0].transactionIds).toEqual([])
    expect(s[0].result).toBe('待复核')
    expect(s[0].confidence).toBe(0.5)
  })

  it('confidence 被夹到 [0,1]', () => {
    const content = JSON.stringify({
      suggestions: [{ type: 'summary', confidence: 5 }],
    })
    const s = parseAuditSuggestions(content, 'analyzeMonth')
    expect(s[0].confidence).toBe(1)
  })
})

describe('buildAuditSystemPrompt', () => {
  it('包含分类 id 列表与任务描述', () => {
    const p = buildAuditSystemPrompt('categorize' as AuditTask)
    expect(p).toContain('food')
    expect(p).toContain('分类建议')
  })
})
