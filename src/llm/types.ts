// LLM 服务配置
export interface LLMConfig {
  enabled: boolean
  endpoint: string
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
  timeout: number
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

export const LLM_PRESETS: ProviderPreset[] = [
  { name: 'openai',   endpoint: 'https://api.openai.com',                          models: ['gpt-4.1-nano', 'gpt-4o-mini', 'gpt-4o'], label: 'OpenAI' },
  { name: 'deepseek', endpoint: 'https://api.deepseek.com',                        models: ['deepseek-v4-flash', 'deepseek-v4-pro'], label: 'DeepSeek' },
  { name: 'qwen',     endpoint: 'https://dashscope.aliyuncs.com/compatible-mode',  models: ['qwen3.5-flash', 'qwen-turbo', 'qwen-plus'], label: '通义千问' },
  { name: 'custom',   endpoint: '',                                                models: [],                                  label: '自定义' },
]

export const VALID_CATEGORIES = ['food', 'transport', 'shopping', 'entertainment', 'housing', 'medical', 'education', 'other'] as const
