import { useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { runChat } from '@/llm/service'
import type { ChatContext, ChatIntentResult } from '@/llm/chatPrompt'
import { parseInput } from '@/nlp'
import { useLLMSettings } from './useLLMSettings'
import type { ChatMessage, ChatCard, ParsedTransaction } from '@/db/types'
import type { LLMParseResult } from '@/llm/types'

// ── 上下文构建:每次发送时拉最新数据,供 LLM 答查询/解析"刚才那笔" ──
async function buildContext(): Promise<ChatContext> {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  const lastYm = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${pad(now.getMonth())}`
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const recent = await db.transactions.orderBy('date').reverse().limit(20).toArray()
  const all = await db.transactions.toArray()
  const cats = await db.categories.toArray()
  const categoryMap: Record<string, string> = {}
  for (const c of cats) categoryMap[c.id] = c.name

  let monthExpense = 0
  let monthIncome = 0
  let lastMonthExpense = 0
  let todayExpense = 0
  const monthCategorySums: Record<string, number> = {}

  for (const t of all) {
    if (t.date.startsWith(ym)) {
      if (t.type === 'expense') {
        monthExpense += t.amount
        monthCategorySums[t.category] = (monthCategorySums[t.category] ?? 0) + t.amount
        if (t.date === today) todayExpense += t.amount
      } else {
        monthIncome += t.amount
      }
    }
    if (t.date.startsWith(lastYm) && t.type === 'expense') lastMonthExpense += t.amount
  }

  return { recentTransactions: recent, monthExpense, monthIncome, lastMonthExpense, todayExpense, monthCategorySums, categoryMap }
}

// LLMParseResult -> ParsedTransaction(卡片展示与确认入库用)
function toParsed(t: LLMParseResult, rawInput: string): ParsedTransaction {
  const conf = t.confidence >= 0.7 ? 'high' : 'medium'
  return {
    amount: t.amount,
    amountConfidence: t.amount === null ? 'low' : conf,
    category: t.category,
    categoryConfidence: conf,
    date: t.date,
    time: t.time,
    note: t.note,
    rawInput,
    type: t.type,
    needsReview: t.amount === null,
  }
}

// AI 未启用时的本地回退:仅 record(本地 NLP)+ 提示
function localNlpFallback(content: string): ChatIntentResult {
  const p = parseInput(content)
  if (p.amount !== null) {
    return {
      intent: 'record',
      transaction: {
        amount: p.amount, type: p.type, category: p.category,
        date: p.date, time: p.time, note: p.note, confidence: 0.6,
      },
      reply: 'AI 未启用,用本地规则解析了这笔,确认记录吗?',
    }
  }
  return {
    intent: 'chat',
    reply: 'AI 未启用,我只能本地解析记账。请在设置里配置 AI 后体验查询、修改、删除等能力。',
  }
}

export function useChat() {
  const { config } = useLLMSettings()
  const [sending, setSending] = useState(false)

  const messages = (useLiveQuery(
    () => db.chatMessages.orderBy('createdAt').toArray(),
  ) ?? []) as ChatMessage[]

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim()
    if (!content || sending) return

    await db.chatMessages.add({ role: 'user', content, createdAt: Date.now() })
    setSending(true)

    try {
      const allMsgs = await db.chatMessages.orderBy('createdAt').toArray()
      const history = allMsgs.map((m) => ({ role: m.role, content: m.content }))
      const context = await buildContext()

      let intentResult: ChatIntentResult | null = null
      let errorMsg: string | undefined

      if (config?.enabled && config.apiKey && config.endpoint && config.model) {
        const r = await runChat(config, history, context)
        intentResult = r.result
        errorMsg = r.error
      } else {
        intentResult = localNlpFallback(content)
      }

      const assistantMsg = buildAssistantMessage(content, intentResult, errorMsg, context)
      await db.chatMessages.add(assistantMsg)
    } catch (e) {
      await db.chatMessages.add({
        role: 'assistant',
        content: `出错了:${e instanceof Error ? e.message : '未知错误'}`,
        intent: 'chat',
        createdAt: Date.now(),
      })
    } finally {
      setSending(false)
    }
  }, [config, sending])

  // 确认卡片:执行 record/modify/delete
  const confirmCard = useCallback(async (messageId: number) => {
    const msg = await db.chatMessages.get(messageId)
    if (!msg?.card || msg.card.status !== 'pending') return
    const card = msg.card
    const now = Date.now()

    if (card.kind === 'record' && card.parsed) {
      const p = card.parsed
      await db.transactions.add({
        amount: p.amount ?? 0,
        category: p.category,
        date: p.date,
        time: p.time || undefined,
        note: p.note,
        type: p.type,
        rawInput: p.rawInput,
        createdAt: now,
        updatedAt: now,
      })
    } else if (card.kind === 'modify' && card.txId !== undefined && card.changes) {
      await db.transactions.update(card.txId, { ...card.changes, updatedAt: now })
    } else if (card.kind === 'delete' && card.txId !== undefined) {
      await db.transactions.delete(card.txId)
    }

    await db.chatMessages.update(messageId, { card: { ...card, status: 'confirmed' } })
  }, [])

  const cancelCard = useCallback(async (messageId: number) => {
    const msg = await db.chatMessages.get(messageId)
    if (!msg?.card || msg.card.status !== 'pending') return
    await db.chatMessages.update(messageId, { card: { ...msg.card, status: 'cancelled' } })
  }, [])

  const clearMessages = useCallback(async () => {
    await db.chatMessages.clear()
  }, [])

  return {
    messages,
    sending,
    sendMessage,
    confirmCard,
    cancelCard,
    clearMessages,
    aiEnabled: !!(config?.enabled && config.apiKey && config.endpoint && config.model),
  }
}

// ── 意图 -> assistant 消息(含可选确认卡片)──
function buildAssistantMessage(
  userInput: string,
  intentResult: ChatIntentResult | null,
  errorMsg: string | undefined,
  context: ChatContext,
): ChatMessage {
  const base: ChatMessage = { role: 'assistant', content: '', createdAt: Date.now() }

  if (!intentResult) {
    return { ...base, intent: 'chat', content: `AI 暂时不可用${errorMsg ? `(${errorMsg})` : ''},稍后重试看看?` }
  }

  const { intent, reply } = intentResult

  if (intent === 'record' && intentResult.transaction) {
    const card: ChatCard = {
      kind: 'record',
      status: 'pending',
      parsed: toParsed(intentResult.transaction, userInput),
    }
    return { ...base, intent, content: reply, card }
  }

  if (intent === 'modify' && intentResult.txId !== undefined && intentResult.changes) {
    const target = context.recentTransactions.find((t) => t.id === intentResult.txId)
    if (target) {
      const card: ChatCard = {
        kind: 'modify',
        status: 'pending',
        txId: target.id,
        snapshot: target,
        changes: intentResult.changes,
      }
      return { ...base, intent, content: reply, card }
    }
    return { ...base, intent: 'chat', content: '没找到你说的那笔交易,能再说具体点吗?比如金额或备注。' }
  }

  if (intent === 'delete' && intentResult.txId !== undefined) {
    const target = context.recentTransactions.find((t) => t.id === intentResult.txId)
    if (target) {
      const card: ChatCard = {
        kind: 'delete',
        status: 'pending',
        txId: target.id,
        snapshot: target,
      }
      return { ...base, intent, content: reply, card }
    }
    return { ...base, intent: 'chat', content: '没找到要删除的那笔,能再说具体点吗?' }
  }

  // query / chat / 兜底
  return { ...base, intent: 'chat', content: reply || '嗯嗯' }
}
