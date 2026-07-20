import { describe, it, expect, afterEach } from 'vitest'
import { __setLLMTransport } from './client'
import { callLLM, callLLMBatch, runLLMAudit } from './service'
import type { LLMConfig } from './types'
import type { Transaction } from '@/db/types'

const config: LLMConfig = {
  enabled: true,
  endpoint: 'https://api.test',
  apiKey: 'sk-x',
  model: 'm',
  maxTokens: 100,
  temperature: 0.1,
  timeout: 1000,
}

type FetchLike = typeof fetch

function contentFetch(content: string | undefined): FetchLike {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: content === undefined ? {} : { content } }] }),
  })) as unknown as FetchLike
}

function errorFetch(status: number): FetchLike {
  return (async () => ({ ok: false, status, json: async () => ({}) })) as unknown as FetchLike
}

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  amount: 1500,
  category: 'other',
  date: '2026-01-01',
  type: 'expense',
  note: '',
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

describe('callLLM', () => {
  let reset: (() => void) | undefined
  afterEach(() => { if (reset) { reset(); reset = undefined } })

  it('成功解析返回 result 且无 error', async () => {
    reset = __setLLMTransport(contentFetch(
      '{"amount":50,"type":"expense","category":"food","date":"2026-01-01","time":null,"note":"午餐","confidence":0.9}',
    ))
    const { result, error } = await callLLM(config, '花了50吃午饭')
    expect(error).toBeUndefined()
    expect(result).not.toBeNull()
    expect(result?.amount).toBe(50)
    expect(result?.category).toBe('food')
  })

  it('空 content 返回 empty 错误', async () => {
    reset = __setLLMTransport(contentFetch(undefined))
    const { result, error } = await callLLM(config, '测试')
    expect(result).toBeNull()
    expect(error).toBe('empty')
  })

  it('401 映射为 API Key 无效', async () => {
    reset = __setLLMTransport(errorFetch(401))
    const { result, error } = await callLLM(config, '测试')
    expect(result).toBeNull()
    expect(error).toBe('API Key 无效')
  })
})

describe('callLLMBatch', () => {
  let reset: (() => void) | undefined
  afterEach(() => { if (reset) { reset(); reset = undefined } })

  it('空 items 直接返回 config 错误', async () => {
    const { results, error } = await callLLMBatch(config, [])
    expect(results).toEqual([])
    expect(error).toBe('config')
  })

  it('成功返回分类数组', async () => {
    reset = __setLLMTransport(contentFetch(
      '[{"category":"food","confidence":0.9},{"category":"transport","confidence":0.8}]',
    ))
    const { results, error } = await callLLMBatch(config, ['吃饭', '打车'])
    expect(error).toBeUndefined()
    expect(results).toHaveLength(2)
    expect(results[0]?.category).toBe('food')
    expect(results[1]?.category).toBe('transport')
  })

  it('空 content 返回 empty 错误与等长 null 数组', async () => {
    reset = __setLLMTransport(contentFetch(undefined))
    const { results, error } = await callLLMBatch(config, ['a', 'b', 'c'])
    expect(error).toBe('empty')
    expect(results).toEqual([null, null, null])
  })
})

describe('runLLMAudit', () => {
  let reset: (() => void) | undefined
  afterEach(() => { if (reset) { reset(); reset = undefined } })

  it('成功返回 LLM 建议且无 error', async () => {
    reset = __setLLMTransport(contentFetch(
      '{"suggestions":[{"type":"anomaly","transactionIds":[1],"result":"大额","confidence":0.8,"reason":"test"}]}',
    ))
    const { suggestions, error } = await runLLMAudit(config, [tx()], 'audit')
    expect(error).toBeUndefined()
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].type).toBe('anomaly')
  })

  it('errorKind 回退启发式并带 error', async () => {
    reset = __setLLMTransport(errorFetch(401))
    const { suggestions, error } = await runLLMAudit(config, [tx()], 'audit')
    // 始终返回建议(heuristic:1500 支出触发 anomaly)
    expect(suggestions.some((s) => s.type === 'anomaly')).toBe(true)
    expect(error).toBe('API Key 无效')
  })

  it('空 content 回退启发式且不带 error(onEmpty=parse)', async () => {
    reset = __setLLMTransport(contentFetch(undefined))
    const { suggestions, error } = await runLLMAudit(config, [tx()], 'audit')
    expect(suggestions.some((s) => s.type === 'anomaly')).toBe(true)
    expect(error).toBeUndefined()
  })

  it('LLM 返回零建议时回退启发式', async () => {
    reset = __setLLMTransport(contentFetch('{"suggestions":[]}'))
    const { suggestions, error } = await runLLMAudit(config, [tx()], 'audit')
    expect(suggestions.some((s) => s.type === 'anomaly')).toBe(true)
    expect(error).toBeUndefined()
  })
})
