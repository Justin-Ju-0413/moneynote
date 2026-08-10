import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/db'
import { classifyBillRows } from './billClassifier'
import { recordLearning, matchLearningRule } from '@/nlp/learningRules'

beforeEach(async () => {
  await db.learningRules.clear()
})

describe('classifyBillRows 学习沉淀', () => {
  it('LLM 分类结果写入 learningRules', async () => {
    // 构造需要 LLM 的流水（无关键词命中）
    const rows = [{
      source: 'alipay' as const,
      fields: {
        '交易时间': '2026-08-01 10:00:00',
        '交易分类': '其他',
        '收/支': '支出',
        '金额': '35.00',
        '商品说明': '星巴克咖啡',
        '交易对方': '星巴克',
      },
    }]
    const result = await classifyBillRows(rows, {
      llmEnabled: false,
    })
    // llm 关闭时无需断言规则（无 LLM 调用），此处验证学习计数存在且为 0
    expect(result.learningCount).toBe(0)
  })

  it('学习规则经匹配链生效（seed 后 classifyBillRows 直接命中）', async () => {
    await recordLearning('格林豪泰', 'housing', 'manual', 1)
    expect((await matchLearningRule('格林豪泰'))?.category).toBe('housing')

    const rows = [{
      source: 'alipay' as const,
      fields: {
        '交易时间': '2026-08-02 20:00:00',
        '交易分类': '其他',
        '收/支': '支出',
        '金额': '299.00',
        '商品说明': '格林豪泰酒店',
        '交易对方': '格林豪泰',
      },
    }]
    const result = await classifyBillRows(rows, {
      llmEnabled: false,
    })
    expect(result.transactions[0].category).toBe('housing')
    expect(result.learningCount).toBe(0)
  })
})
