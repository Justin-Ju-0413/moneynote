// 聊天记账:system prompt + 上下文注入 + 意图解析
// 单次 LLM 调用返回结构化意图(record/query/modify/delete/chat),本地执行。复用 P1-2 runTask。
import dayjs from 'dayjs'
import type { Transaction, ChatIntent } from '@/db/types'
import type { LLMParseResult } from './types'
import { VALID_CATEGORIES } from './types'
import { CATEGORY_MAP } from '@/utils/constants'

type Message = { role: string; content: string }

// ── 上下文:注入最近交易 + 月度汇总,让 LLM 能答查询、解析"刚才那笔" ──
export interface ChatContext {
  recentTransactions: Transaction[]
  monthExpense: number
  monthIncome: number
  lastMonthExpense: number
  todayExpense: number
  monthCategorySums: Record<string, number>
}

export interface ChatModifyChanges {
  amount?: number
  category?: string
  note?: string
  type?: 'expense' | 'income'
  date?: string
  time?: string
}

export interface ChatIntentResult {
  intent: ChatIntent
  transaction?: LLMParseResult      // record: 待记交易
  txId?: number                     // modify/delete: 目标交易 id
  changes?: ChatModifyChanges       // modify: 要改的字段
  reply: string
}

const CATEGORY_LIST = VALID_CATEGORIES.join('、')

const SYSTEM_PROMPT = `你是 MoneyNote 记账助手,通过自然对话帮用户记账、查询、修改、删除交易。只返回严格 JSON,不要解释或 markdown 代码块。

## 数据上下文
{context}

## 意图
判断用户最新一条消息的意图:
- record:记一笔新交易,提取 transaction。
- query:问消费情况(花了多少、最近哪笔、某分类多少),依据上下文作答,reply 给出答案。
- modify:改已有交易,从最近交易里选 txId,给 changes。不确定是哪笔时 intent=chat 并在 reply 请用户澄清。
- delete:删已有交易,给 txId。不确定同上。
- chat:闲聊或其他,reply。

## 输出格式
{
  "intent": "record|query|modify|delete|chat",
  "transaction": {"amount":<number|null>,"type":"expense|income","category":"<id>","date":"YYYY-MM-DD","time":"HH:mm|null","note":"<string>"},
  "txId": <number>,
  "changes": {"amount":<number>,"category":"<id>","note":"<string>","type":"expense|income","date":"YYYY-MM-DD","time":"HH:mm"},
  "reply": "<简短自然中文回复>"
}

## 规则
1. 只返回 JSON,不要 markdown 或额外文本
2. category 必须是以下之一: ${CATEGORY_LIST}
3. record:amount 正数;收入场景(工资/报销/收款/红包等)type=income;未提日期用今天
4. modify/delete:txId 必须来自上面最近交易的 id;不确定则 intent=chat 澄清
5. query:reply 直接答,可引用上下文数字
6. reply 简短自然,像朋友聊天
7. 只填用到的字段,其余省略
8. record/modify/delete 都需用户确认后才执行,reply 必须用一句简短征询语气(如"记一笔咖啡 -¥25?""要把这笔改成50吗?""删除这笔午餐?"),不要用"已记录/已删除/已修改"等过去式,也不要留空`

export function buildContextBlock(ctx: ChatContext): string {
  const today = dayjs().format('YYYY-MM-DD')
  const lines: string[] = []
  lines.push(`今天是 ${today}。`)
  lines.push(
    `本月支出 ¥${ctx.monthExpense.toFixed(2)}、收入 ¥${ctx.monthIncome.toFixed(2)};` +
    `上月支出 ¥${ctx.lastMonthExpense.toFixed(2)};今日支出 ¥${ctx.todayExpense.toFixed(2)}。`,
  )
  const catParts = Object.entries(ctx.monthCategorySums)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${CATEGORY_MAP[k]?.name ?? k} ¥${v.toFixed(2)}`)
  if (catParts.length) lines.push(`本月分类支出:${catParts.join('、')}。`)

  const recent = ctx.recentTransactions.slice(0, 20)
  if (recent.length) {
    lines.push('最近交易:')
    for (const t of recent) {
      lines.push(
        `  - id=${t.id} | ${t.date}${t.time ? ' ' + t.time : ''} | ` +
        `${t.type === 'income' ? '收入' : '支出'} ¥${t.amount.toFixed(2)} | ` +
        `${CATEGORY_MAP[t.category]?.name ?? t.category} | ${t.note ?? ''}`,
      )
    }
  } else {
    lines.push('最近交易:(暂无)')
  }
  return lines.join('\n')
}

// 构建消息:system(含上下文)+ 最近 10 轮历史
export function buildChatMessages(
  history: Message[],
  context: ChatContext,
): Message[] {
  const system = SYSTEM_PROMPT.replace('{context}', buildContextBlock(context))
  return [{ role: 'system', content: system }, ...history.slice(-10)]
}

// ── 意图解析 ──

function normalizeTransaction(t: Record<string, unknown>): LLMParseResult {
  let amount: number | null = null
  if (typeof t.amount === 'number' && t.amount > 0) amount = t.amount
  else if (typeof t.amount === 'string') {
    const n = parseFloat(t.amount)
    if (!isNaN(n) && n > 0) amount = n
  }
  const type = t.type === 'income' ? 'income' : 'expense'
  const category =
    typeof t.category === 'string' && (VALID_CATEGORIES as readonly string[]).includes(t.category)
      ? t.category
      : 'other'
  let date = dayjs().format('YYYY-MM-DD')
  if (typeof t.date === 'string' && dayjs(t.date, 'YYYY-MM-DD', true).isValid()) date = t.date
  let time: string | null = null
  if (typeof t.time === 'string' && /^\d{2}:\d{2}$/.test(t.time)) time = t.time
  const note = typeof t.note === 'string' ? t.note.trim() : ''
  return { amount, type, category, date, time, note, confidence: 0.8 }
}

function normalizeChanges(c: Record<string, unknown>): ChatModifyChanges {
  const out: ChatModifyChanges = {}
  if (typeof c.amount === 'number' && c.amount > 0) out.amount = c.amount
  else if (typeof c.amount === 'string') {
    const n = parseFloat(c.amount)
    if (!isNaN(n) && n > 0) out.amount = n
  }
  if (typeof c.category === 'string' && (VALID_CATEGORIES as readonly string[]).includes(c.category)) {
    out.category = c.category
  }
  if (typeof c.note === 'string') out.note = c.note.trim()
  if (c.type === 'income' || c.type === 'expense') out.type = c.type
  if (typeof c.date === 'string' && dayjs(c.date, 'YYYY-MM-DD', true).isValid()) out.date = c.date
  if (typeof c.time === 'string' && /^\d{2}:\d{2}$/.test(c.time)) out.time = c.time
  return out
}

const VALID_INTENTS: ChatIntent[] = ['record', 'query', 'modify', 'delete', 'chat']

export function parseChatIntent(raw: string): ChatIntentResult | null {
  if (!raw || !raw.trim()) return null

  let obj: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(raw.trim())
    if (typeof parsed === 'object' && parsed !== null) obj = parsed as Record<string, unknown>
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) {
      try { obj = JSON.parse(m[0]) } catch { return null }
    }
  }
  if (!obj) return null

  const intentRaw = obj.intent
  const intent: ChatIntent =
    typeof intentRaw === 'string' && (VALID_INTENTS as string[]).includes(intentRaw)
      ? (intentRaw as ChatIntent)
      : 'chat'
  const reply = typeof obj.reply === 'string' ? obj.reply : ''

  const result: ChatIntentResult = { intent, reply }

  if (intent === 'record' && obj.transaction && typeof obj.transaction === 'object') {
    result.transaction = normalizeTransaction(obj.transaction as Record<string, unknown>)
  }
  if ((intent === 'modify' || intent === 'delete') && typeof obj.txId === 'number') {
    result.txId = obj.txId
  }
  if (intent === 'modify' && obj.changes && typeof obj.changes === 'object') {
    const changes = normalizeChanges(obj.changes as Record<string, unknown>)
    if (Object.keys(changes).length > 0) result.changes = changes
  }
  return result
}
