import { describe, it, expect, afterEach } from 'vitest'
import { __setLLMTransport } from './client'
import { runTask, type TaskDescriptor, type TaskContext } from './task'
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

const ctx: TaskContext = { config, privacyMode: true }

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

describe('runTask', () => {
  let reset: (() => void) | undefined
  afterEach(() => { if (reset) { reset(); reset = undefined } })

  const echoTask: TaskDescriptor<string, string> = {
    name: 'echo',
    buildMessages: (input) => [{ role: 'user', content: input }],
    chatOptions: { maxTokens: 50, timeout: 1000 },
    parse: (content) => content || null,
  }

  it('解析成功返回 result', async () => {
    reset = __setLLMTransport(contentFetch('hello'))
    const r = await runTask(echoTask, 'hi', ctx)
    expect(r.result).toBe('hello')
    expect(r.error).toBeUndefined()
  })

  it('errorKind 无 fallback 返回 error', async () => {
    reset = __setLLMTransport(errorFetch(401))
    const r = await runTask(echoTask, 'hi', ctx)
    expect(r.result).toBeNull()
    expect(r.error).toBe('API Key 无效')
  })

  it('errorKind 有 fallback 返回 fallback 结果并带 error', async () => {
    reset = __setLLMTransport(errorFetch(401))
    const task: TaskDescriptor<string, string> = { ...echoTask, fallback: () => 'FALLBACK' }
    const r = await runTask(task, 'hi', ctx)
    expect(r.result).toBe('FALLBACK')
    expect(r.error).toBe('API Key 无效')
  })

  it('空 content(onEmpty=error)返回 empty', async () => {
    reset = __setLLMTransport(contentFetch(undefined))
    const r = await runTask(echoTask, 'hi', ctx)
    expect(r.result).toBeNull()
    expect(r.error).toBe('empty')
  })

  it('空 content 有 fallback 返回 fallback 并带 empty', async () => {
    reset = __setLLMTransport(contentFetch(undefined))
    const task: TaskDescriptor<string, string> = { ...echoTask, fallback: () => 'FALLBACK' }
    const r = await runTask(task, 'hi', ctx)
    expect(r.result).toBe('FALLBACK')
    expect(r.error).toBe('empty')
  })

  it('onEmpty=parse 时空 content 交 parse 处理', async () => {
    reset = __setLLMTransport(contentFetch(undefined))
    const task: TaskDescriptor<string, string> = {
      ...echoTask,
      onEmpty: 'parse',
      parse: (c) => (c === '' ? 'EMPTY_PARSED' : c || null),
    }
    const r = await runTask(task, 'hi', ctx)
    expect(r.result).toBe('EMPTY_PARSED')
    expect(r.error).toBeUndefined()
  })

  it('parse 返回 null 返回 parse 错误', async () => {
    reset = __setLLMTransport(contentFetch('unparseable'))
    const task: TaskDescriptor<string, string> = { ...echoTask, parse: () => null }
    const r = await runTask(task, 'hi', ctx)
    expect(r.result).toBeNull()
    expect(r.error).toBe('parse')
  })

  it('validate 不过 且无 fallback 返回 parse 错误', async () => {
    reset = __setLLMTransport(contentFetch('something'))
    const task: TaskDescriptor<string, string> = { ...echoTask, validate: () => false }
    const r = await runTask(task, 'hi', ctx)
    expect(r.result).toBeNull()
    expect(r.error).toBe('parse')
  })

  it('validate 不过 有 fallback 返回 fallback 且不带 error', async () => {
    reset = __setLLMTransport(contentFetch('something'))
    const task: TaskDescriptor<string, string> = { ...echoTask, validate: () => false, fallback: () => 'FALLBACK' }
    const r = await runTask(task, 'hi', ctx)
    expect(r.result).toBe('FALLBACK')
    expect(r.error).toBeUndefined()
  })

  it('chatOptions(maxTokens/responseFormat)透传到 llmChat 请求体', async () => {
    let captured: Record<string, unknown> = {}
    reset = __setLLMTransport((async (_u: unknown, init: RequestInit) => {
      captured = JSON.parse(init.body as string)
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'x' } }] }) }
    }) as unknown as FetchLike)
    const task: TaskDescriptor<string, string> = {
      name: 't',
      buildMessages: (i) => [{ role: 'user', content: i }],
      chatOptions: { maxTokens: 777, timeout: 5000, responseFormat: 'json_object' },
      parse: (c) => c || null,
    }
    await runTask(task, 'hi', ctx)
    expect(captured.max_tokens).toBe(777)
    expect(captured.response_format).toEqual({ type: 'json_object' })
  })

  it('buildMessages 可读 ctx.privacyMode', async () => {
    let seenPrivacy: boolean | undefined
    const task: TaskDescriptor<string, string> = {
      name: 't',
      buildMessages: (_i, c) => { seenPrivacy = c.privacyMode; return [{ role: 'user', content: 'x' }] },
      chatOptions: { maxTokens: 10, timeout: 1000 },
      parse: (c) => c || null,
    }
    reset = __setLLMTransport(contentFetch('ok'))
    await runTask(task, 'hi', { config, privacyMode: false })
    expect(seenPrivacy).toBe(false)
  })
})
