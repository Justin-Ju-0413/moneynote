import type { LLMConfig, LLMParseResult, AuditTask, AiSuggestion } from './types'
import { buildMessages, parseLLMResponse, buildBatchMessages, parseBatchResponse } from './prompt'
import type { BatchClassifyItem } from './prompt'
import { buildAuditSystemPrompt, parseAuditSuggestions } from './auditPrompt'
import { maybeRedact } from './redact'
import { llmChat, llmErrorMessage } from './client'
import type { Transaction } from '@/db/types'
import { matchCategory } from '@/nlp/categoryMatcher'

export interface CallResult {
  result: LLMParseResult | null
  error?: string
}

// 调用 OpenAI 兼容 API（自然语言解析单条）
export async function callLLM(config: LLMConfig, userInput: string): Promise<CallResult> {
  const { content, errorKind, errorMessage } = await llmChat(config, {
    messages: buildMessages(userInput),
    maxTokens: 300,
    timeout: 8000,
  })
  if (errorKind) return { result: null, error: llmErrorMessage(errorKind, errorMessage) }
  if (!content) return { result: null, error: 'empty' }

  const parsed = parseLLMResponse(content)
  if (!parsed) return { result: null, error: 'parse' }
  return { result: parsed }
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
  items: string[],
  privacyMode = true,
): Promise<BatchResult> {
  if (items.length === 0) return { results: [], error: 'config' }

  const messages = buildBatchMessages(items.map((item) => maybeRedact(item, privacyMode)))
  const { content, errorKind, errorMessage } = await llmChat(config, {
    messages,
    maxTokens: 512,
    timeout: 15000,
  })
  if (errorKind) {
    return { results: new Array(items.length).fill(null), error: llmErrorMessage(errorKind, errorMessage) }
  }
  if (!content) return { results: new Array(items.length).fill(null), error: 'empty' }

  return { results: parseBatchResponse(content, items.length) }
}

// ── AI 工作台：统一审计服务（移植自 项控 ledger-ai-agent）──

// 发送给 LLM 的交易载荷（脱敏后）
interface AuditPayloadTransaction {
  id: number
  date: string
  time: string | null
  amount: number
  type: string
  category: string
  note: string
}

// 将本地交易转为脱敏后的 LLM 载荷
export function redactTransaction(transaction: Transaction, privacyMode: boolean): AuditPayloadTransaction {
  return {
    id: transaction.id ?? 0,
    date: transaction.date,
    time: transaction.time ?? null,
    amount: transaction.amount,
    type: transaction.type,
    category: transaction.category,
    note: maybeRedact(transaction.note ?? '', privacyMode),
  }
}

export interface AuditResult {
  suggestions: AiSuggestion[]
  error?: string
}

// 运行 AI 审计任务：audit / categorize / dedupe / analyzeMonth
export async function runLLMAudit(
  config: LLMConfig,
  transactions: Transaction[],
  task: AuditTask,
  options: { privacyMode?: boolean; batchSize?: number } = {},
): Promise<AuditResult> {
  const privacyMode = options.privacyMode ?? config.privacyMode ?? true
  const batchSize = options.batchSize ?? config.batchSize ?? 120

  const payload = transactions
    .slice(0, Math.max(1, batchSize))
    .map((t) => redactTransaction(t, privacyMode))

  const { content, errorKind, errorMessage } = await llmChat(config, {
    messages: [
      { role: 'system', content: buildAuditSystemPrompt(task) },
      { role: 'user', content: JSON.stringify({ transactions: payload }) },
    ],
    maxTokens: 800,
    timeout: 20000,
    responseFormat: 'json_object',
  })

  // 出错(含未配置/离线)->回退本地启发式
  if (errorKind) {
    return { suggestions: heuristicSuggestions(transactions, task), error: llmErrorMessage(errorKind, errorMessage) }
  }

  // 空 content 视作 '{}'(json_object 模式下偶发),与原实现一致
  const suggestions = parseAuditSuggestions(content ?? '{}', task)
  return {
    suggestions: suggestions.length ? suggestions : heuristicSuggestions(transactions, task),
  }
}

// 本地启发式建议（无 API Key 或请求失败时的回退）
export function heuristicSuggestions(transactions: Transaction[], task: AuditTask): AiSuggestion[] {
  const now = Date.now()
  const suggestions: AiSuggestion[] = []

  // 分类建议：本地关键词匹配与当前分类不一致时
  if (task === 'audit' || task === 'categorize') {
    for (const t of transactions) {
      if (t.id === undefined) continue
      const matched = matchCategory(`${t.note ?? ''} ${t.category}`)
      if (matched.confidence !== 'low' && matched.category !== t.category) {
        suggestions.push({
          task,
          type: 'category',
          transactionIds: [t.id],
          result: matched.category,
          confidence: 0.68,
          reason: `基于备注关键词的本地规则建议（命中“${matched.matchedKeyword}”），未调用外部 API。`,
          status: 'pending',
          createdAt: now,
        })
      }
    }
  }

  // 异常建议：单笔大额支出
  if (task === 'audit') {
    for (const t of transactions) {
      if (t.id === undefined) continue
      if (t.amount >= 1000 && t.type === 'expense') {
        suggestions.push({
          task,
          type: 'anomaly',
          transactionIds: [t.id],
          result: '大额支出',
          confidence: 0.74,
          reason: '单笔支出金额超过 1000 元，建议复核是否为真实消费或转账。',
          status: 'pending',
          createdAt: now,
        })
      }
    }
  }

  // 重复建议：同日 + 同金额 + 同方向
  if (task === 'audit' || task === 'dedupe') {
    const groups = new Map<string, Transaction[]>()
    for (const t of transactions) {
      if (t.id === undefined) continue
      const key = `${t.date}|${t.amount}|${t.type}`
      const arr = groups.get(key) ?? []
      arr.push(t)
      groups.set(key, arr)
    }
    for (const group of groups.values()) {
      if (group.length > 1) {
        suggestions.push({
          task,
          type: 'duplicate',
          transactionIds: group.map((t) => t.id as number),
          result: '疑似重复流水',
          confidence: 0.72,
          reason: '同日、同方向、同金额，建议人工确认。',
          status: 'pending',
          createdAt: now,
        })
      }
    }
  }

  // 月度摘要：本地汇总
  if (task === 'analyzeMonth') {
    const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    suggestions.push({
      task,
      type: 'summary',
      transactionIds: transactions.slice(0, 20).filter((t) => t.id !== undefined).map((t) => t.id as number),
      result: `支出 ¥${expense.toFixed(2)}，收入 ¥${income.toFixed(2)}`,
      confidence: 0.62,
      reason: '基于当前筛选流水的本地汇总，未调用外部 API。',
      status: 'pending',
      createdAt: now,
    })
  }

  return suggestions
}
