// AI 工作台 prompt 构建与响应解析
// 移植自 项控(ledger-ai-agent) src/services/aiService.ts，适配 MoneyNote 的分类 id 体系与数字主键
import type { AuditTask, AiSuggestion, SuggestionType } from './types'
import { ALL_CATEGORIES } from './types'

const CATEGORY_LIST = ALL_CATEGORIES.join('、')

// 任务 -> 允许返回的建议类型
function allowedTypesForTask(task: AuditTask): SuggestionType[] {
  if (task === 'categorize') return ['category']
  if (task === 'dedupe') return ['duplicate']
  if (task === 'analyzeMonth') return ['summary']
  return ['category', 'duplicate', 'anomaly', 'summary']
}

export function isSuggestionType(value: unknown): value is SuggestionType {
  return value === 'category' || value === 'duplicate' || value === 'anomaly' || value === 'summary'
}

// 构建任务专属 system prompt
export function buildAuditSystemPrompt(task: AuditTask): string {
  const base = `你是个人账单审计助手。只返回严格 JSON 对象，格式为 {"suggestions":[{"type":"category","transactionIds":[123],"result":"food","confidence":0.9,"reason":"依据商户和备注"}]}。suggestions 只能是对象数组，不能是字符串数组。type 只能为 category、duplicate、anomaly、summary。category 建议的 result 只能为：${CATEGORY_LIST}（支出交易用支出分类、收入交易用收入分类）。必须使用输入里的 id（数字），不要编造不存在的交易。`
  const taskText: Record<AuditTask, string> = {
    categorize: '本次只做分类建议，每笔交易尽量返回一条 category 建议。',
    dedupe: '本次只找疑似重复流水，返回 duplicate 建议，transactionIds 给出重复的各笔 id，不要返回分类。',
    audit: '本次做审计，返回异常 anomaly、重复 duplicate 和必要的 category 建议。',
    analyzeMonth: '本次做月度摘要，返回 summary 建议，result 写简短结论，reason 写结构化依据。',
  }
  return `${base}${taskText[task]}`
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

// 解析 LLM 响应为建议数组
export function parseAuditSuggestions(content: string, task: AuditTask): AiSuggestion[] {
  try {
    const parsed = JSON.parse(content) as { suggestions?: Array<Partial<AiSuggestion>> }
    const allowed = allowedTypesForTask(task)
    return (parsed.suggestions ?? [])
      .filter((s) => typeof s === 'object' && !Array.isArray(s))
      .filter((s) => isSuggestionType(s.type) && allowed.includes(s.type))
      .map((s) => ({
        task,
        type: s.type as SuggestionType,
        transactionIds: Array.isArray(s.transactionIds)
          ? s.transactionIds.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
          : [],
        result: typeof s.result === 'string' ? s.result : '待复核',
        confidence: clampConfidence(Number(s.confidence ?? 0.5)),
        reason: typeof s.reason === 'string' ? s.reason : 'AI 未提供详细理由。',
        status: 'pending' as const,
        createdAt: Date.now(),
      }))
  } catch {
    return []
  }
}

export { allowedTypesForTask }
