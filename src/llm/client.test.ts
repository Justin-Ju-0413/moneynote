import { describe, it, expect, afterEach } from 'vitest'
import { llmChat, llmErrorMessage, __setLLMTransport } from './client'
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

function mockFetch(resp: { ok?: boolean; status?: number; body?: unknown }): FetchLike {
  return (async () => ({
    ok: resp.ok ?? true,
    status: resp.status ?? 200,
    json: async () => resp.body ?? {},
  })) as unknown as FetchLike
}

describe('llmChat', () => {
  let reset: (() => void) | undefined
  afterEach(() => { if (reset) { reset(); reset = undefined } })

  it('配置缺失返回 config', async () => {
    const r = await llmChat({ ...config, apiKey: '' }, { messages: [] })
    expect(r.errorKind).toBe('config')
    expect(r.content).toBeNull()
  })

  it('200 且有 content 返回 content', async () => {
    reset = __setLLMTransport(mockFetch({ body: { choices: [{ message: { content: 'hello' } }] } }))
    const r = await llmChat(config, { messages: [{ role: 'user', content: 'hi' }] })
    expect(r.content).toBe('hello')
    expect(r.errorKind).toBeUndefined()
  })

  it('200 但无 content 返回 content null(空,不带 errorKind)', async () => {
    reset = __setLLMTransport(mockFetch({ body: { choices: [{ message: {} }] } }))
    const r = await llmChat(config, { messages: [] })
    expect(r.content).toBeNull()
    expect(r.errorKind).toBeUndefined()
  })

  it('401 映射为 http + API Key 无效', async () => {
    reset = __setLLMTransport(mockFetch({ ok: false, status: 401 }))
    const r = await llmChat(config, { messages: [] })
    expect(r.errorKind).toBe('http')
    expect(r.errorMessage).toBe('API Key 无效')
  })

  it('429 映射为额度不足', async () => {
    reset = __setLLMTransport(mockFetch({ ok: false, status: 429 }))
    const r = await llmChat(config, { messages: [] })
    expect(r.errorMessage).toBe('API 额度不足')
  })

  it('404 映射为模型不存在', async () => {
    reset = __setLLMTransport(mockFetch({ ok: false, status: 404 }))
    const r = await llmChat(config, { messages: [] })
    expect(r.errorMessage).toBe('模型不存在')
  })

  it('其他状态码返回通用服务端错误', async () => {
    reset = __setLLMTransport(mockFetch({ ok: false, status: 500 }))
    const r = await llmChat(config, { messages: [] })
    expect(r.errorMessage).toBe('服务端错误 (500)')
  })

  it('fetch 抛错映射为 network', async () => {
    reset = __setLLMTransport((async () => { throw new Error('connection refused') }) as unknown as FetchLike)
    const r = await llmChat(config, { messages: [] })
    expect(r.errorKind).toBe('network')
  })

  it('response_format 透传到请求体', async () => {
    let captured: { response_format?: unknown } = {}
    reset = __setLLMTransport((async (_url: unknown, init: RequestInit) => {
      captured = JSON.parse(init.body as string)
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{}' } }] }) }
    }) as unknown as FetchLike)
    await llmChat(config, { messages: [], responseFormat: 'json_object' })
    expect(captured.response_format).toEqual({ type: 'json_object' })
  })

  it('Authorization 头带 Bearer + apiKey', async () => {
    let headers: HeadersInit | undefined
    reset = __setLLMTransport((async (_url: unknown, init: RequestInit) => {
      headers = init.headers
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'x' } }] }) }
    }) as unknown as FetchLike)
    await llmChat(config, { messages: [] })
    expect((headers as Record<string, string>).Authorization).toBe('Bearer sk-x')
  })
})

describe('llmErrorMessage', () => {
  it('http 用文案', () => {
    expect(llmErrorMessage('http', 'API Key 无效')).toBe('API Key 无效')
  })
  it('非 http 用 kind 名', () => {
    expect(llmErrorMessage('timeout')).toBe('timeout')
    expect(llmErrorMessage('offline')).toBe('offline')
    expect(llmErrorMessage('network')).toBe('network')
  })
  it('http 缺文案时兜底', () => {
    expect(llmErrorMessage('http')).toBe('服务端错误')
  })
})
