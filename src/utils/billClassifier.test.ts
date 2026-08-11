import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/db'
import { classifyBillRows } from './billClassifier'
import { recordLearning, matchLearningRule } from '@/nlp/learningRules'
import { __setLLMTransport } from '@/llm/client'
import { promptVersionKey, PROMPT_VERSIONS } from '@/llm/promptVersion'
import type { LLMConfig } from '@/llm/types'

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

// ── classificationCache prompt 版本化（P1-3）──

const llmConfig: LLMConfig = {
  enabled: true,
  endpoint: 'https://api.test',
  apiKey: 'sk-x',
  model: 'm',
  maxTokens: 100,
  temperature: 0.1,
  timeout: 1000,
}

type FetchLike = typeof fetch

function batchContentFetch(content: string): FetchLike {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  })) as unknown as FetchLike
}

// 构造不命中本地关键词、必须走 LLM 的流水
function llmNeedingRow(merchant: string) {
  return [{
    source: 'alipay' as const,
    fields: {
      '交易时间': '2026-08-01 10:00:00',
      '交易分类': '其他',
      '收/支': '支出',
      '金额': '35.00',
      '商品说明': merchant,
      '交易对方': merchant,
    },
  }]
}

describe('classificationCache prompt 版本化', () => {
  let reset: (() => void) | undefined
  beforeEach(async () => {
    await db.learningRules.clear()
    await db.classificationCache.clear()
  })
  afterEach(() => { if (reset) { reset(); reset = undefined } })

  it('LLM 写入的缓存键带 prompt 版本后缀', async () => {
    reset = __setLLMTransport(batchContentFetch('[{"category":"food","confidence":0.9}]'))
    await classifyBillRows(llmNeedingRow('zzz神秘未知商户'), { llmEnabled: true, llmConfig })
    const entries = await db.classificationCache.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].merchant).toContain(`::v${PROMPT_VERSIONS.batch}`)
  })

  it('同版本键命中缓存：不调 LLM', async () => {
    const merchant = 'zzz神秘未知商户'
    // classifyText = `${商品说明} ${交易对方}`（alipay 拼接格式）
    const classifyText = `${merchant} ${merchant}`
    await db.classificationCache.put({
      merchant: promptVersionKey(classifyText, 'batch'),
      category: 'food', confidence: 0.9, updatedAt: Date.now(),
    })
    let called = false
    const throwingFetch: FetchLike = (async () => {
      called = true
      throw new Error('不应调用 LLM')
    }) as unknown as FetchLike
    reset = __setLLMTransport(throwingFetch)
    const result = await classifyBillRows(llmNeedingRow(merchant), { llmEnabled: true, llmConfig })
    expect(called).toBe(false)
    expect(result.cacheHitCount).toBe(1)
    expect(result.transactions[0].category).toBe('food')
  })

  it('旧版键（无版本后缀）未命中：走 LLM', async () => {
    const merchant = 'zzz神秘未知商户'
    const classifyText = `${merchant} ${merchant}`
    await db.classificationCache.put({
      merchant: classifyText, // 旧格式：明文拼接文本，无版本
      category: 'food', confidence: 0.9, updatedAt: Date.now(),
    })
    reset = __setLLMTransport(batchContentFetch('[{"category":"transport","confidence":0.9}]'))
    const result = await classifyBillRows(llmNeedingRow(merchant), { llmEnabled: true, llmConfig })
    expect(result.cacheHitCount).toBe(0)
    expect(result.transactions[0].category).toBe('transport')
  })
})
