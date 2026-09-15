import { describe, it, expect, afterEach } from 'vitest'
import { llmChat, llmErrorMessage, normalizeEndpoint, __setLLMTransport } from './client'
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

  it('endpoint 含 /v1 时实际请求 URL 不双拼', async () => {
    let calledUrl = ''
    reset = __setLLMTransport((async (url: string) => {
      calledUrl = url
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'x' } }] }) }
    }) as unknown as FetchLike)
    await llmChat({ ...config, endpoint: 'https://api.deepseek.com/v1' }, { messages: [] })
    expect(calledUrl).toBe('https://api.deepseek.com/v1/chat/completions')
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

describe('normalizeEndpoint', () => {
  it('base 无 /v1 不变', () => {
    expect(normalizeEndpoint('https://api.deepseek.com')).toBe('https://api.deepseek.com')
  })
  it('去掉尾斜杠', () => {
    expect(normalizeEndpoint('https://api.x.com/')).toBe('https://api.x.com')
  })
  it('去掉结尾 /v1', () => {
    expect(normalizeEndpoint('https://api.x.com/v1')).toBe('https://api.x.com')
  })
  it('去掉结尾 /v1/ (尾斜杠 + v1)', () => {
    expect(normalizeEndpoint('https://api.x.com/v1/')).toBe('https://api.x.com')
  })
  it('保留路径中间段(如 compatible-mode)', () => {
    expect(normalizeEndpoint('https://dashscope.aliyuncs.com/compatible-mode'))
      .toBe('https://dashscope.aliyuncs.com/compatible-mode')
  })
  it('保留路径中间段并去结尾 /v1', () => {
    expect(normalizeEndpoint('https://dashscope.aliyuncs.com/compatible-mode/v1'))
      .toBe('https://dashscope.aliyuncs.com/compatible-mode')
  })
  it('OpenCode Go 多段路径 + /v1 归一化后拼回正确 chat/completions', () => {
    // 预设 endpoint https://opencode.ai/zen/go/v1 → 归一化 → 拼 /v1/chat/completions
    expect(normalizeEndpoint('https://opencode.ai/zen/go/v1')).toBe('https://opencode.ai/zen/go')
    expect(`${normalizeEndpoint('https://opencode.ai/zen/go/v1')}/v1/chat/completions`)
      .toBe('https://opencode.ai/zen/go/v1/chat/completions')
  })
  it('trim 首尾空白', () => {
    expect(normalizeEndpoint('  https://api.x.com  ')).toBe('https://api.x.com')
  })
  it('大小写不敏感 V1', () => {
    expect(normalizeEndpoint('https://api.x.com/V1')).toBe('https://api.x.com')
  })
  it('多个尾斜杠全去', () => {
    expect(normalizeEndpoint('https://api.x.com///')).toBe('https://api.x.com')
  })
})

// ── C3 成本可观测：usage 透传 ──

describe('llmChat usage（C3）', () => {
  let reset: (() => void) | undefined
  afterEach(() => { if (reset) { reset(); reset = undefined } })

  it('响应含 usage 时解析到 LLMChatResult', async () => {
    reset = __setLLMTransport(mockFetch({
      body: {
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    }))
    const r = await llmChat(config, { messages: [] })
    expect(r.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
  })

  it('响应无 usage 时为 undefined（旧 provider 零影响）', async () => {
    reset = __setLLMTransport(mockFetch({ body: { choices: [{ message: { content: '{}' } }] } }))
    const r = await llmChat(config, { messages: [] })
    expect(r.usage).toBeUndefined()
  })

  it('usage 缺 completion_tokens 时用总数回退', async () => {
    reset = __setLLMTransport(mockFetch({
      body: {
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    }))
    const r = await llmChat(config, { messages: [] })
    expect(r.usage?.totalTokens).toBe(15)
  })
})

// ── 流式(stream:true + SSE):聚合/usage 捕获/自动降级 ──

function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

/** 构造 SSE 流式 Response mock:events 为原始网络分段(每段一个 ReadableStream chunk) */
function sseFetch(parts: string[], contentType = 'text/event-stream'): FetchLike {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(enc.encode(p))
      controller.close()
    },
  })
  return (async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    body: stream,
  })) as unknown as FetchLike
}

function jsonFetch(body: unknown, contentType = 'application/json'): FetchLike {
  return (async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    json: async () => body,
  })) as unknown as FetchLike
}

describe('llmChat stream（SSE 流式）', () => {
  let reset: (() => void) | undefined
  afterEach(() => { if (reset) { reset(); reset = undefined } })

  it('带 stream 时请求体加 stream:true;不带时无 stream 字段', async () => {
    const bodies: Record<string, unknown>[] = []
    reset = __setLLMTransport((async (_url: unknown, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string))
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'x' } }] }) }
    }) as unknown as FetchLike)
    await llmChat(config, { messages: [], stream: { onDelta: undefined } })
    await llmChat(config, { messages: [] })
    expect(bodies[0].stream).toBe(true)
    expect('stream' in bodies[1]).toBe(false)
  })

  it('SSE delta 聚合为完整文本,onDelta 按序逐段回调', async () => {
    reset = __setLLMTransport(sseFetch([
      sseEvent({ choices: [{ delta: { content: '{"int' } }] }),
      sseEvent({ choices: [{ delta: { content: 'ent":"chat",' } }] }),
      sseEvent({ choices: [{ delta: { content: '"reply":"你好"}' } }] }),
      'data: [DONE]\n\n',
    ]))
    const deltas: string[] = []
    const r = await llmChat(config, { messages: [], stream: { onDelta: (t) => deltas.push(t) } })
    expect(r.content).toBe('{"intent":"chat","reply":"你好"}')
    expect(r.errorKind).toBeUndefined()
    expect(deltas).toEqual(['{"int', 'ent":"chat",', '"reply":"你好"}'])
  })

  it('事件行跨网络分段断开(粘包/半包)仍正确聚合', async () => {
    const whole = sseEvent({ choices: [{ delta: { content: '记账助手' } }] }) + 'data: [DONE]\n\n'
    const mid = Math.floor(whole.length / 2)
    reset = __setLLMTransport(sseFetch([whole.slice(0, mid), whole.slice(mid)]))
    const deltas: string[] = []
    const r = await llmChat(config, { messages: [], stream: { onDelta: (t) => deltas.push(t) } })
    expect(r.content).toBe('记账助手')
    expect(deltas).toEqual(['记账助手'])
  })

  it('末 data chunk 携带 usage 时捕获(OpenAI 兼容流式形态)', async () => {
    reset = __setLLMTransport(sseFetch([
      sseEvent({ choices: [{ delta: { content: 'hi' } }] }),
      sseEvent({ choices: [{ delta: {} }], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } }),
      'data: [DONE]\n\n',
    ]))
    const r = await llmChat(config, { messages: [], stream: {} })
    expect(r.content).toBe('hi')
    expect(r.usage).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 })
  })

  it('SSE 无 usage 时为 undefined(usage 缺失零影响)', async () => {
    reset = __setLLMTransport(sseFetch([
      sseEvent({ choices: [{ delta: { content: 'x' } }] }),
      'data: [DONE]\n\n',
    ]))
    const r = await llmChat(config, { messages: [], stream: {} })
    expect(r.content).toBe('x')
    expect(r.usage).toBeUndefined()
  })

  it('坏 data 行(非 JSON)被忽略,其余事件正常聚合', async () => {
    reset = __setLLMTransport(sseFetch([
      'data: not-json\n\n',
      sseEvent({ choices: [{ delta: { content: 'ok' } }] }),
      'data: [DONE]\n\n',
    ]))
    const r = await llmChat(config, { messages: [], stream: {} })
    expect(r.content).toBe('ok')
  })

  it('[DONE] 后停止消费:后续多余事件不进聚合', async () => {
    reset = __setLLMTransport(sseFetch([
      sseEvent({ choices: [{ delta: { content: 'a' } }] }),
      'data: [DONE]\n\n',
      sseEvent({ choices: [{ delta: { content: 'b' } }] }),
    ]))
    const r = await llmChat(config, { messages: [], stream: {} })
    expect(r.content).toBe('a')
  })

  it('流结束无 [DONE] 时冲刷缓冲尾行,聚合不丢尾部', async () => {
    reset = __setLLMTransport(sseFetch([
      sseEvent({ choices: [{ delta: { content: 'a' } }] }),
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'tail' } }] })}`, // 无尾换行
    ]))
    const r = await llmChat(config, { messages: [], stream: {} })
    expect(r.content).toBe('atail')
  })

  it('自动降级:provider 忽略 stream 参数回整包 JSON 时按非流式解析,onDelta 不触发', async () => {
    reset = __setLLMTransport(jsonFetch(
      { choices: [{ message: { content: '整包响应' } }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } },
    ))
    const deltas: string[] = []
    const r = await llmChat(config, { messages: [], stream: { onDelta: (t) => deltas.push(t) } })
    expect(r.content).toBe('整包响应')
    expect(r.usage?.totalTokens).toBe(7)
    expect(deltas).toEqual([])
  })

  it('流式响应 content-type 大小写/带 charset 仍识别', async () => {
    reset = __setLLMTransport(sseFetch([sseEvent({ choices: [{ delta: { content: 'z' } }] }), 'data: [DONE]\n\n'], 'text/event-stream; charset=utf-8'))
    const r = await llmChat(config, { messages: [], stream: {} })
    expect(r.content).toBe('z')
  })

  it('流读取中途抛错映射为 network(沿用现有错误路径)', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseEvent({ choices: [{ delta: { content: 'partial' } }] })))
        controller.error(new Error('connection reset'))
      },
    })
    reset = __setLLMTransport((async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: stream,
    })) as unknown as FetchLike)
    const r = await llmChat(config, { messages: [], stream: {} })
    expect(r.content).toBeNull()
    expect(r.errorKind).toBe('network')
  })

  it('空流(零 delta)返回 content null 且不带 errorKind,与非流式空 content 语义一致', async () => {
    reset = __setLLMTransport(sseFetch(['data: [DONE]\n\n']))
    const r = await llmChat(config, { messages: [], stream: {} })
    expect(r.content).toBeNull()
    expect(r.errorKind).toBeUndefined()
  })
})
