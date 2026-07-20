import type { LLMConfig, LLMParseResult, AuditTask, AiSuggestion } from './types'
import { buildMessages, parseLLMResponse, buildBatchMessages, parseBatchResponse } from './prompt'
import type { BatchClassifyItem } from './prompt'
import { buildAuditSystemPrompt, parseAuditSuggestions } from './auditPrompt'
import { buildChatMessages, parseChatIntent } from './chatPrompt'
import type { ChatContext, ChatIntentResult } from './chatPrompt'
import { maybeRedact } from './redact'
import { runTask, type TaskContext, type TaskDescriptor } from './task'
import type { Transaction } from '@/db/types'
import { matchCategory } from '@/nlp/categoryMatcher'

export interface CallResult {
  result: LLMParseResult | null
  error?: string
}

// ── 任务描述符(P1-2 注册式):新 AI 任务零改调度 ──

// 单条自然语言解析
const parseTask: TaskDescriptor<string, LLMParseResult> = {
  name: 'parse',
  buildMessages: (input) => buildMessages(input),
  chatOptions: { maxTokens: 300, timeout: 8000 },
  parse: (content) => parseLLMResponse(content),
}

// 批量分类(多条记录一次 API 请求)
const batchTask: TaskDescriptor<string[], (BatchClassifyItem | null)[]> = {
  name: 'batchClassify',
  buildMessages: (items, ctx) => buildBatchMessages(items.map((item) => maybeRedact(item, ctx.privacyMode))),
  chatOptions: { maxTokens: 512, timeout: 15000 },
  parse: (content, items) => parseBatchResponse(content, items.length),
}

// ── 公共 API ──

// 调用 OpenAI 兼容 API（自然语言解析单条）
export async function callLLM(config: LLMConfig, userInput: string): Promise<CallResult> {
  return runTask(parseTask, userInput, { config, privacyMode: false })
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

export async function callLLMBatch(
  config: LLMConfig,
  items: string[],
  privacyMode = true,
): Promise<BatchResult> {
  if (items.length === 0) return { results: [], error: 'config' }
  const r = await runTask(batchTask, items, { config, privacyMode })
  return { results: r.result ?? new Array(items.length).fill(null), error: r.error }
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

// 审计任务输入
interface AuditInput {
  transactions: Transaction[]
  task: AuditTask
  options: { privacyMode?: boolean; batchSize?: number }
}

// 审计任务:audit / categorize / dedupe / analyzeMonth
const auditTask: TaskDescriptor<AuditInput, AiSuggestion[]> = {
  name: 'audit',
  onEmpty: 'parse', // 空 content(json_object 模式偶发)交 parse 当 '{}' 处理
  chatOptions: { maxTokens: 4000, timeout: 20000, responseFormat: 'json_object' },
  buildMessages: (input, ctx) => {
    const privacyMode = input.options.privacyMode ?? ctx.config.privacyMode ?? true
    const batchSize = input.options.batchSize ?? ctx.config.batchSize ?? 120
    const payload = input.transactions
      .slice(0, Math.max(1, batchSize))
      .map((t) => redactTransaction(t, privacyMode))
    return [
      { role: 'system', content: buildAuditSystemPrompt(input.task) },
      { role: 'user', content: JSON.stringify({ transactions: payload }) },
    ]
  },
  parse: (content, input) => parseAuditSuggestions(content || '{}', input.task),
  validate: (suggestions) => suggestions.length > 0,
  // 出错/空/零建议 -> 回退本地启发式
  fallback: (input) => heuristicSuggestions(input.transactions, input.task),
}

// 运行 AI 审计任务：audit / categorize / dedupe / analyzeMonth
export async function runLLMAudit(
  config: LLMConfig,
  transactions: Transaction[],
  task: AuditTask,
  options: { privacyMode?: boolean; batchSize?: number } = {},
): Promise<AuditResult> {
  const ctx: TaskContext = { config, privacyMode: options.privacyMode ?? config.privacyMode ?? true }
  const r = await runTask(auditTask, { transactions, task, options }, ctx)
  return { suggestions: r.result ?? heuristicSuggestions(transactions, task), error: r.error }
}

// ── 聊天记账(ChatGPT 式对话):单次 LLM 调用返回结构化意图 ──

interface ChatInput {
  history: { role: 'user' | 'assistant'; content: string }[]
  context: ChatContext
}

const chatTask: TaskDescriptor<ChatInput, ChatIntentResult> = {
  name: 'chat',
  // 推理模型(deepseek-v4-flash)reasoning_content 计入 max_tokens,预算给足避免 JSON 被截断
  chatOptions: { maxTokens: 2000, timeout: 20000, responseFormat: 'json_object' },
  buildMessages: (input) => buildChatMessages(input.history, input.context),
  parse: (content) => parseChatIntent(content),
}

export interface ChatRunResult {
  result: ChatIntentResult | null
  error?: string
}

// 运行聊天意图识别:history 含当前用户消息(作为最后一条),context 为数据上下文
export async function runChat(
  config: LLMConfig,
  history: { role: 'user' | 'assistant'; content: string }[],
  context: ChatContext,
): Promise<ChatRunResult> {
  const r = await runTask(chatTask, { history, context }, { config, privacyMode: false })
  return { result: r.result, error: r.error }
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
