import type { ColumnRole } from '@/db/types'
import type { LLMConfig } from '@/llm/types'
import { buildMappingMessages, parseMappingResponse } from './aiPrompt'
import { llmChat, llmErrorMessage } from '@/llm/client'

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
  const messages = buildMappingMessages(request.headers, request.sampleRows, request.knownRoles)
  const { content, errorKind, errorMessage } = await llmChat(config, {
    messages,
    maxTokens: 512,
    timeout: 15000,
  })
  if (errorKind) return { roles: [], error: llmErrorMessage(errorKind, errorMessage) }
  if (!content) return { roles: [], error: 'empty' }

  const parsed = parseMappingResponse(content, request.headers.length)
  const roles = parsed.map(r => r ? { role: r.role, confidence: r.confidence } : { role: 'skip', confidence: 0 })

  return { roles }
}
