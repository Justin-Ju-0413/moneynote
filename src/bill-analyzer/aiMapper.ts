import type { ColumnRole } from '@/db/types'
import type { LLMConfig } from '@/llm/types'
import { buildMappingMessages, parseMappingResponse } from './aiPrompt'

// ── AI 辅助列映射 ──

/**
 * 当启发式分析无法确定所有关键列角色时，调用 AI 辅助推断。
 * 启发式已确定的角色优先保留，AI 仅补充空白。
 */
export async function aiAssistColumnMapping(
  config: LLMConfig,
  headers: string[],
  sampleRows: string[][],
  heuristicRoles: (ColumnRole | null)[],
): Promise<(ColumnRole | null)[]> {
  // 调用 LLM
  const result = await callLLMForMapping(config, {
    headers,
    sampleRows,
    knownRoles: heuristicRoles,
  })

  if (result.error || !result.roles) {
    return heuristicRoles
  }

  // 合并：启发式高置信度优先，AI 补充空白
  const merged: (ColumnRole | null)[] = [...heuristicRoles]

  for (let i = 0; i < headers.length; i++) {
    // 启发式已确定的角色保持不变
    if (heuristicRoles[i] && heuristicRoles[i] !== 'skip') continue

    // 使用 AI 结果填充
    const aiResult = result.roles[i]
    if (aiResult && aiResult.confidence >= 0.6) {
      const role = aiResult.role as ColumnRole
      // 避免关键角色冲突（date/amount 只允许一个）
      if ((role === 'date' || role === 'amount') && merged.includes(role)) continue
      merged[i] = role
    }
  }

  return merged
}

// ── LLM 调用封装 ──

interface MappingRequest {
  headers: string[]
  sampleRows: string[][]
  knownRoles: (ColumnRole | null)[]
}

interface MappingResponse {
  roles: { role: string; confidence: number }[]
  error?: string
}

async function callLLMForMapping(
  config: LLMConfig,
  request: MappingRequest,
): Promise<MappingResponse> {
  if (!navigator.onLine) {
    return { roles: [], error: 'offline' }
  }
  if (!config.apiKey || !config.endpoint || !config.model) {
    return { roles: [], error: 'config' }
  }

  const messages = buildMappingMessages(request.headers, request.sampleRows, request.knownRoles)
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
      return { roles: [], error }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return { roles: [], error: 'empty' }

    const parsed = parseMappingResponse(content, request.headers.length)
    const roles = parsed.map(r => r ? { role: r.role, confidence: r.confidence } : { role: 'skip', confidence: 0 })

    return { roles }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { roles: [], error: 'timeout' }
    }
    return { roles: [], error: 'network' }
  }
}
