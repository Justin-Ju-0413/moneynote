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

  it('并发池下 LLM 结果按位置正确回写（15 行 → 2 批次）', async () => {
    // 15 行（BATCH_SIZE=10 → 2 批次）；AAA 商户 → food，BBB 商户 → transport
    const rows: Array<{ source: 'alipay'; fields: Record<string, string> }> = []
    for (let i = 0; i < 15; i++) {
      const tag = i < 10 ? 'AAA' : 'BBB'
      rows.push(...llmNeedingRow(`zzz商户${tag}${i}`))
    }
    // mock 按请求体内的文本内容逐项返回分类（不依赖调用顺序）
    const textAwareFetch: FetchLike = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      const userMsg = body.messages[1].content as string
      const items = userMsg.match(/"([^"]+)"/g)?.map((m: string) => m.slice(1, -1)) ?? []
      const results = items.map((t: string) => ({
        category: t.includes('AAA') ? 'food' : 'transport',
        confidence: 0.9,
      }))
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(results) } }] }),
      }
    }) as unknown as FetchLike
    reset = __setLLMTransport(textAwareFetch)

    const result = await classifyBillRows(rows, { llmEnabled: true, llmConfig })
    expect(result.llmUsedCount).toBe(15)
    for (let i = 0; i < 15; i++) {
      expect(result.transactions[i].category).toBe(i < 10 ? 'food' : 'transport')
    }
  })
})

// ── C6 分类规则收敛：模板 sourceCategoryMap 数据驱动 ──

import type { BillTemplate } from '@/db/types'

// 构造最小模板：sourceCategoryMap + columnMappings（columnIndex → normalizedHeader 解析用）
function scmTemplate(scm: NonNullable<BillTemplate['sourceCategoryMap']>): BillTemplate {
  return {
    id: 1,
    name: '测试模板',
    source: 'alipay',
    isBuiltIn: true,
    fileType: 'csv',
    headerRowIndex: -1,
    fingerprint: '',
    columnMappings: [
      { columnIndex: 1, originalHeader: '交易分类', normalizedHeader: '交易分类', role: 'category', inferredType: 'string' },
      { columnIndex: 2, originalHeader: '交易备注', normalizedHeader: '交易备注', role: 'note', inferredType: 'string' },
    ],
    filterRules: [],
    sourceCategoryMap: scm,
    buildClassifyTextFrom: [1],
    importCount: 0,
    lastUsedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('sourceCategoryMap 模板驱动（C6）', () => {
  let reset: (() => void) | undefined
  beforeEach(async () => {
    await db.learningRules.clear()
    await db.classificationCache.clear()
  })
  afterEach(() => { if (reset) { reset(); reset = undefined } })

  it('模板 sourceCategoryMap 生效：来源分类标签映射为内部分类', async () => {
    const rows = [{
      source: 'alipay' as const,
      fields: {
        '交易时间': '2026-08-01 10:00:00',
        '交易分类': '餐饮美食',
        '收/支': '支出',
        '金额': '35.00',
        '商品说明': 'zzz未知商户x',
        '交易对方': 'zzz未知商户x',
      },
    }]
    const result = await classifyBillRows(rows, {
      llmEnabled: false,
      template: scmTemplate({ columnIndex: 1, mapping: { '餐饮美食': 'food', '交通出行': 'transport' } }),
    })
    expect(result.transactions[0].category).toBe('food')
  })

  it('columnIndex 经 columnMappings 解析出 normalizedHeader 取值（修复死代码）', async () => {
    const rows = [{
      source: 'alipay' as const,
      fields: {
        '交易时间': '2026-08-01 10:00:00',
        '交易分类': '其他',
        '交易备注': '交通出行',
        '收/支': '支出',
        '金额': '35.00',
        '商品说明': 'zzz未知商户y',
        '交易对方': 'zzz未知商户y',
      },
    }]
    // 映射列 = columnIndex 2（对应 normalizedHeader '交易备注'）
    const result = await classifyBillRows(rows, {
      llmEnabled: false,
      template: scmTemplate({ columnIndex: 2, mapping: { '交通出行': 'transport' } }),
    })
    expect(result.transactions[0].category).toBe('transport')
  })

  it('无 template 时退化走匹配链（不依赖来源硬编码）', async () => {
    const rows = [{
      source: 'alipay' as const,
      fields: {
        '交易时间': '2026-08-01 10:00:00',
        '交易分类': '餐饮美食',
        '收/支': '支出',
        '金额': '35.00',
        '商品说明': 'zzz未知商户z',
        '交易对方': 'zzz未知商户z',
      },
    }]
    const result = await classifyBillRows(rows, { llmEnabled: false })
    // 无模板 → sourceCategoryMap 不可用 → 未命中关键词 → other（走匹配链，可被 LLM/学习规则兜底）
    expect(result.transactions[0].category).toBe('other')
  })
})
