import { describe, it, expect, afterEach } from 'vitest'
import { __setLLMTransport } from './client'
import { aiAssistColumnMapping } from './mapping'
import type { LLMConfig } from './types'

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

function contentFetch(content: string): FetchLike {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  })) as unknown as FetchLike
}

function errorFetch(status: number): FetchLike {
  return (async () => ({ ok: false, status, json: async () => ({}) })) as unknown as FetchLike
}

describe('aiAssistColumnMapping（P1-4 mappingTask）', () => {
  let reset: (() => void) | undefined
  afterEach(() => { if (reset) { reset(); reset = undefined } })

  const headers = ['日期', '金额', '备注']
  const sampleRows = [['2024-03-15', '35.00', '午餐']]

  it('AI 补充空白列，启发式已知角色不被覆盖', async () => {
    reset = __setLLMTransport(contentFetch(
      '[{"role":"date","confidence":0.9},{"role":"note","confidence":0.8},{"role":"amount","confidence":0.9}]',
    ))
    const roles = await aiAssistColumnMapping(config, headers, sampleRows, ['date', null, 'amount'])
    expect(roles).toEqual(['date', 'note', 'amount'])
  })

  it('errorKind 时回退启发式角色', async () => {
    reset = __setLLMTransport(errorFetch(401))
    const roles = await aiAssistColumnMapping(config, headers, sampleRows, ['date', null, null])
    expect(roles).toEqual(['date', null, null])
  })

  it('空 content 时回退启发式角色', async () => {
    reset = __setLLMTransport(contentFetch(''))
    const roles = await aiAssistColumnMapping(config, headers, sampleRows, [null, 'amount', null])
    expect(roles).toEqual([null, 'amount', null])
  })

  it('非法 role 映射为 skip', async () => {
    reset = __setLLMTransport(contentFetch('[{"role":"hacker","confidence":0.9}]'))
    const roles = await aiAssistColumnMapping(config, ['表头'], [['x']], [null])
    expect(roles).toEqual(['skip'])
  })

  it('confidence < 0.6 不采纳，保持空白', async () => {
    reset = __setLLMTransport(contentFetch('[{"role":"note","confidence":0.5},{"role":"amount","confidence":0.9},{"role":"date","confidence":0.9}]'))
    const roles = await aiAssistColumnMapping(config, headers, sampleRows, [null, null, null])
    expect(roles).toEqual([null, 'amount', 'date'])
  })

  it('date/amount 关键角色去重：AI 重复报 date 时被忽略', async () => {
    reset = __setLLMTransport(contentFetch('[{"role":"date","confidence":0.9},{"role":"date","confidence":0.9},{"role":"amount","confidence":0.9}]'))
    const roles = await aiAssistColumnMapping(config, headers, sampleRows, ['date', null, null])
    expect(roles).toEqual(['date', null, 'amount'])
  })

  it('启发式已确定角色不被 AI 覆盖', async () => {
    reset = __setLLMTransport(contentFetch('[{"role":"amount","confidence":0.95},{"role":"date","confidence":0.9},{"role":"amount","confidence":0.9}]'))
    const roles = await aiAssistColumnMapping(config, headers, sampleRows, ['note', null, 'amount'])
    // col0 note 与 col2 amount 为启发式确定，AI 报的 amount/amount 被忽略；col1 空白由 AI 填 date
    expect(roles).toEqual(['note', 'date', 'amount'])
  })

  it('非 JSON 响应时 AI 部分为 null（启发式保留）', async () => {
    reset = __setLLMTransport(contentFetch('抱歉，无法识别'))
    const roles = await aiAssistColumnMapping(config, headers, sampleRows, ['date', null, 'amount'])
    expect(roles).toEqual(['date', null, 'amount'])
  })

  it('chatOptions 透传（max_tokens=512）', async () => {
    let body: Record<string, unknown> = {}
    const capture: FetchLike = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '[]' } }] }) }
    }) as unknown as FetchLike
    reset = __setLLMTransport(capture)
    await aiAssistColumnMapping(config, headers, sampleRows, ['date', null, 'amount'])
    expect(body.max_tokens).toBe(512)
  })
})
