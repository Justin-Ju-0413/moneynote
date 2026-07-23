// 统一 LLM HTTP 客户端:收敛原先 service.ts(3 份)+ aiMapper.ts(1 份)重复的 fetch 管道。
// OpenAI 兼容为基;Provider 适配器(P1-2 起)可在这一层扩展。
import type { LLMConfig } from './types'

export type LLMErrorKind = 'offline' | 'config' | 'timeout' | 'network' | 'http'

export interface LLMChatOptions {
  messages: { role: string; content: string }[]
  maxTokens?: number
  temperature?: number
  timeout?: number
  /** 透传 OpenAI response_format(审计任务用 json_object) */
  responseFormat?: 'json_object'
}

export interface LLMChatResult {
  /** 200 且有 content 时为字符串;空 content / 出错时为 null(空 content 不带 errorKind,由调用方决定如何处理) */
  content: string | null
  errorKind?: LLMErrorKind
  /** 仅 errorKind === 'http' 时有值 */
  errorMessage?: string
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

export async function llmChat(config: LLMConfig, opts: LLMChatOptions): Promise<LLMChatResult> {
  if (navigator.onLine === false) return { content: null, errorKind: 'offline' }
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

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    return { content: content ?? null }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { content: null, errorKind: 'timeout' }
    }
    return { content: null, errorKind: 'network' }
  }
}
