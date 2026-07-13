// LLM 服务配置
export interface LLMConfig {
  enabled: boolean
  endpoint: string
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
  timeout: number
  privacyMode?: boolean // AI 工作台/批量分类请求是否脱敏（默认 true）
  batchSize?: number // AI 工作台单次审计条数（默认 120）
}

// LLM 解析结果
export interface LLMParseResult {
  amount: number | null
  category: string
  date: string
  time: string | null
  note: string
  type: 'expense' | 'income'
  confidence: number
}

// 预设 API 供应商
export interface ProviderPreset {
  name: string
  endpoint: string
  models: string[]
  label: string
}

// LLM 调用状态
export type LLMStatus = 'idle' | 'loading' | 'success' | 'error'

// ── AI 工作台（移植自 项控 ledger-ai-agent）──
// 审计任务类型
export type AuditTask = 'audit' | 'categorize' | 'dedupe' | 'analyzeMonth'

// 建议类型
export type SuggestionType = 'category' | 'duplicate' | 'anomaly' | 'summary'

// 建议状态
export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed'

// AI 建议（既是 LLM 返回形状，也是 Dexie 持久化实体）
export interface AiSuggestion {
  id?: number
  task: AuditTask
  type: SuggestionType
  transactionIds: number[] // 关联的 Transaction id（MoneyNote 主键为 number）
  result: string // category 建议时为分类 id；其余为结论文本
  confidence: number
  reason: string
  status: SuggestionStatus
  createdAt: number
}

export const LLM_PRESETS: ProviderPreset[] = [
  { name: 'openai',   endpoint: 'https://api.openai.com',                          models: ['gpt-4.1-nano', 'gpt-4o-mini', 'gpt-4o'], label: 'OpenAI' },
  { name: 'deepseek', endpoint: 'https://api.deepseek.com',                        models: ['deepseek-v4-flash', 'deepseek-v4-pro'], label: 'DeepSeek' },
  { name: 'qwen',     endpoint: 'https://dashscope.aliyuncs.com/compatible-mode',  models: ['qwen3.5-flash', 'qwen-turbo', 'qwen-plus'], label: '通义千问' },
  { name: 'custom',   endpoint: '',                                                models: [],                                  label: '自定义' },
]

export const VALID_CATEGORIES = ['food', 'transport', 'shopping', 'entertainment', 'housing', 'medical', 'education', 'other'] as const
