// 统一 LLM HTTP 客户端:收敛原先 service.ts(3 份)+ aiMapper.ts(1 份)重复的 fetch 管道。
// OpenAI 兼容为基;Provider 适配器(P1-2 起)可在这一层扩展。
import type { LLMConfig } from './types'
import { createSSEParser } from './sse'

export type LLMErrorKind = 'offline' | 'config' | 'timeout' | 'network' | 'http'

/** 流式选项:提供时请求体带 stream:true,按 SSE 解析增量回调;返回值与非流式完全一致 */
export interface LLMStreamOptions {
  /** 每个 delta 片段到达时回调(仅含本段增量文本) */
  onDelta?: (text: string) => void
}

export interface LLMChatOptions {
  messages: { role: string; content: string }[]
  maxTokens?: number
  temperature?: number
  timeout?: number
  /** 透传 OpenAI response_format(审计任务用 json_object) */
  responseFormat?: 'json_object'
  /** 传入即启用流式(OpenAI 兼容 SSE);provider 忽略 stream 参数返回整包 JSON 时自动按非流式解析 */
  stream?: LLMStreamOptions
}

export interface LLMUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface LLMChatResult {
  /** 200 且有 content 时为字符串;空 content / 出错时为 null(空 content 不带 errorKind,由调用方决定如何处理) */
  content: string | null
  errorKind?: LLMErrorKind
  /** 仅 errorKind === 'http' 时有值 */
  errorMessage?: string
  /** token 用量(C3 成本可观测;provider 未返回 usage 时为 undefined;流式下取末 chunk 携带的 usage) */
  usage?: LLMUsage
}

type FetchLike = typeof fetch

// 可注入的 HTTP transport(测试边界),默认全局 fetch
let transport: FetchLike = fetch

/** 测试专用:替换底层 HTTP transport,返回重置函数。 */
export function __setLLMTransport(next: FetchLike): () => void {
  const prev = transport
  transport = next
  return () => { transport = prev }
}

function httpErrorMessage(status: number): string {
  if (status === 401 || status === 403) return 'API Key 无效'
  if (status === 429) return 'API 额度不足'
  if (status === 404) return '模型不存在'
  return `服务端错误 (${status})`
}

/** 把 errorKind 映射为对外错误字符串:http 用文案,其余用 kind 名。 */
export function llmErrorMessage(kind: LLMErrorKind, httpMessage?: string): string {
  return kind === 'http' ? (httpMessage ?? '服务端错误') : kind
}

/**
 * 归一化 endpoint:去掉首尾空白、尾斜杠与结尾的 /v1。
 * 用户常粘贴 `https://api.x.com/v1`(多数文档/工具如此展示),直接拼接
 * `/v1/chat/completions` 会得到 `/v1/v1/...` 触发 404,且错误被映射成
 * 「模型不存在」严重误导排查。归一化后无论是否带 /v1 都能拼出正确路径。
 */
export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '').replace(/\/v1$/i, '')
}

/** 把 OpenAI 兼容响应的 usage 对象归一化;形状不符返回 undefined(usage 缺失零影响)。 */
function normalizeUsage(raw: unknown): LLMUsage | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const u = raw as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown }
  const { prompt_tokens: pt, completion_tokens: ct, total_tokens: tt } = u
  if (typeof pt !== 'number' || typeof ct !== 'number') return undefined
  return { promptTokens: pt, completionTokens: ct, totalTokens: typeof tt === 'number' ? tt : pt + ct }
}

/** 解析单个 SSE data 载荷:取 delta.content 增量与末 chunk 可能携带的 usage;坏 JSON 容错为空。 */
function parseStreamEvent(data: string): { delta: string | null; usage?: LLMUsage } {
  try {
    const obj = JSON.parse(data) as {
      choices?: { delta?: { content?: unknown } }[]
      usage?: unknown
    }
    const d = obj.choices?.[0]?.delta?.content
    return { delta: typeof d === 'string' ? d : null, usage: normalizeUsage(obj.usage) }
  } catch {
    return { delta: null } // 坏行容错:provider 偶发非 JSON data(心跳/注释),跳过
  }
}

/**
 * 读取 SSE 流式响应,聚合为与非流式一致的 LLMChatResult。
 * - 逐 chunk 喂 SSEParser(容忍粘包/断行),累积 choices[0].delta.content 并回调 onDelta
 * - usage 若在任意(通常是末个)data chunk 出现则捕获
 * - [DONE] 后即停止消费(某些 provider 发完后保持连接)
 */
async function readStreamedChat(
  body: ReadableStream<Uint8Array>,
  onDelta?: (text: string) => void,
): Promise<LLMChatResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = createSSEParser()
  let content = ''
  let usage: LLMUsage | undefined
  let sawDone = false

  const consume = (events: string[]): boolean => {
    for (const data of events) {
      if (data === '[DONE]') {
        sawDone = true
        return false
      }
      const ev = parseStreamEvent(data)
      if (ev.delta) {
        content += ev.delta
        onDelta?.(ev.delta)
      }
      if (ev.usage) usage = ev.usage
    }
    return true
  }

  try {
    while (!sawDone) {
      const { done, value } = await reader.read()
      if (done) break
      if (!consume(parser.push(decoder.decode(value, { stream: true })))) break
    }
    if (!sawDone) consume(parser.flush())
  } finally {
    // [DONE] 后流可能未自然结束,主动关闭;锁已释放/流已关时静默
    try {
      if (sawDone) await reader.cancel()
    } catch { /* noop */ }
    try {
      reader.releaseLock()
    } catch { /* noop */ }
  }
  return { content: content || null, usage }
}

export async function llmChat(config: LLMConfig, opts: LLMChatOptions): Promise<LLMChatResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { content: null, errorKind: 'offline' }
  if (!config.apiKey || !config.endpoint || !config.model) {
    return { content: null, errorKind: 'config' }
  }

  const url = `${normalizeEndpoint(config.endpoint)}/v1/chat/completions`
  const body: Record<string, unknown> = {
    model: config.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? config.maxTokens ?? 512,
    temperature: opts.temperature ?? config.temperature ?? 0.1,
  }
  if (opts.responseFormat) {
    body.response_format = { type: opts.responseFormat }
  }
  if (opts.stream) {
    body.stream = true
  }

  try {
    const response = await transport(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeout ?? config.timeout ?? 15000),
    })

    if (!response.ok) {
      return { content: null, errorKind: 'http', errorMessage: httpErrorMessage(response.status) }
    }

    // 流式请求 + provider 确实返回 SSE -> 流式聚合;
    // content-type 不是 text/event-stream(provider 忽略 stream 参数回整包 JSON)或无 body -> 自动降级为非流式解析
    const contentType = typeof response.headers?.get === 'function' ? (response.headers.get('content-type') ?? '') : ''
    if (opts.stream && response.body && contentType.includes('text/event-stream')) {
      return await readStreamedChat(response.body, opts.stream.onDelta)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    // C3: 透出 token 用量(OpenAI 兼容响应含 usage;缺失则 undefined,零影响)
    const usage = normalizeUsage(data.usage)
    return { content: content ?? null, usage }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { content: null, errorKind: 'timeout' }
    }
    return { content: null, errorKind: 'network' }
  }
}
