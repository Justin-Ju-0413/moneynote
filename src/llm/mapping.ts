import type { ColumnRole } from '@/db/types'
import type { LLMConfig } from './types'
import { buildMappingMessages, parseMappingResponse } from './mappingPrompt'
import type { MappingResult } from './mappingPrompt'
import { runTask } from './task'
import type { TaskDescriptor } from './task'

// ── AI 列映射任务（P1-4：原 bill-analyzer/aiMapper 手写管道并入 runTask 抽象）──

interface MappingRequest {
  headers: string[]
  sampleRows: string[][]
  knownRoles: (ColumnRole | null)[]
}

type MappingOutput = (ColumnRole | null)[]

// 合并：启发式高置信度优先，AI 仅补充空白（原 aiAssistColumnMapping 逻辑原样搬入 parse）
function mergeMappingRoles(input: MappingRequest, parsed: (MappingResult | null)[]): MappingOutput {
  const merged: (ColumnRole | null)[] = [...input.knownRoles]

  for (let i = 0; i < input.headers.length; i++) {
    // 启发式已确定的角色保持不变
    if (input.knownRoles[i] && input.knownRoles[i] !== 'skip') continue

    // 使用 AI 结果填充
    const aiResult = parsed[i]
    if (aiResult && aiResult.confidence >= 0.6) {
      const role = aiResult.role as ColumnRole
      // 避免关键角色冲突（date/amount 只允许一个）
      if ((role === 'date' || role === 'amount') && merged.includes(role)) continue
      merged[i] = role
    }
  }

  return merged
}

const mappingTask: TaskDescriptor<MappingRequest, MappingOutput> = {
  name: 'mapping',
  buildMessages: (input) => buildMappingMessages(input.headers, input.sampleRows, input.knownRoles),
  chatOptions: { maxTokens: 512, timeout: 15000 },
  parse: (content, input) => mergeMappingRoles(input, parseMappingResponse(content, input.headers.length)),
  // 错误/空响应时回退启发式角色（原行为：返回 heuristicRoles）
  fallback: (input) => input.knownRoles,
}

/**
 * 当启发式分析无法确定所有关键列角色时，调用 AI 辅助推断。
 * 启发式已确定的角色优先保留，AI 仅补充空白。
 * 签名与并入前一致（P1-4 行为保持）。
 */
export async function aiAssistColumnMapping(
  config: LLMConfig,
  headers: string[],
  sampleRows: string[][],
  heuristicRoles: (ColumnRole | null)[],
): Promise<(ColumnRole | null)[]> {
  const { result } = await runTask(
    mappingTask,
    { headers, sampleRows, knownRoles: heuristicRoles },
    { config, privacyMode: false },
  )
  return result ?? heuristicRoles
}
