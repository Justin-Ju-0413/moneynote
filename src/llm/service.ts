import type { LLMConfig, LLMParseResult } from './types'
import { buildMessages, parseLLMResponse, buildBatchMessages, parseBatchResponse } from './prompt'
import type { BatchClassifyItem } from './prompt'

export interface CallResult {
  result: LLMParseResult | null
  error?: string
}

// 调用 OpenAI 兼容 API
export async function callLLM(config: LLMConfig, userInput: string): Promise<CallResult> {
  // 离线检测
  if (!navigator.onLine) {
    return { result: null, error: 'offline' }
  }

  if (!config.apiKey || !config.endpoint || !config.model) {
    return { result: null, error: 'config' }
  }

  const messages = buildMessages(userInput)
  const url = `${config.endpoint.replace(/\/$/, '')}/v1/chat/completions`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: config.maxTokens || 300,
        temperature: config.temperature ?? 0.1,
      }),
      signal: AbortSignal.timeout(config.timeout || 8000),
    })

    if (!response.ok) {
      const status = response.status
      if (status === 401 || status === 403) {
        return { result: null, error: 'API Key 无效，请检查设置' }
      }
      if (status === 429) {
        return { result: null, error: 'API 额度不足或请求过于频繁' }
      }
      if (status === 404) {
        return { result: null, error: '模型名称不存在，请检查配置' }
      }
      return { result: null, error: `服务端错误 (${status})` }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return { result: null, error: 'empty' }
    }

    const parsed = parseLLMResponse(content)
    if (!parsed) {
      return { result: null, error: 'parse' }
    }

    return { result: parsed }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { result: null, error: 'timeout' }
    }
    return { result: null, error: 'network' }
  }
}

// 测试连接（发送最简请求验证配置）
export async function testLLMConnection(config: LLMConfig): Promise<{ success: boolean; message: string }> {
  const { result, error } = await callLLM(config, '测试')

  if (error === 'offline') return { success: false, message: '当前无网络连接' }
  if (error === 'config') return { success: false, message: '配置不完整' }
  if (error) return { success: false, message: error }
  if (result) return { success: true, message: `连接成功！分类: ${result.category}` }
  return { success: false, message: '响应解析失败' }
}

// 批量分类结果
export interface BatchResult {
  results: (BatchClassifyItem | null)[]
  error?: string
}

// 批量分类调用（多条记录一次 API 请求）
export async function callLLMBatch(
  config: LLMConfig,
  items: string[]
): Promise<BatchResult> {
  if (!navigator.onLine) return { results: new Array(items.length).fill(null), error: 'offline' }
  if (!config.apiKey || !config.endpoint || !config.model || items.length === 0) {
    return { results: new Array(items.length).fill(null), error: 'config' }
  }

  const messages = buildBatchMessages(items)
  const url = `${config.endpoint.replace(/\/$/, '')}/v1/chat/completions`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: config.maxTokens || 512,
        temperature: config.temperature ?? 0.1,
      }),
      signal: AbortSignal.timeout(config.timeout || 15000),
    })

    if (!response.ok) {
      const status = response.status
      let error = `服务端错误 (${status})`
      if (status === 401 || status === 403) error = 'API Key 无效'
      else if (status === 429) error = 'API 额度不足'
      else if (status === 404) error = '模型不存在'
      return { results: new Array(items.length).fill(null), error }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return { results: new Array(items.length).fill(null), error: 'empty' }

    return { results: parseBatchResponse(content, items.length) }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { results: new Array(items.length).fill(null), error: 'timeout' }
    }
    return { results: new Array(items.length).fill(null), error: 'network' }
  }
}
