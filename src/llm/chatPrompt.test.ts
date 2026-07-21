import { describe, it, expect } from 'vitest'
import { parseChatIntent, buildChatMessages, buildContextBlock } from './chatPrompt'
import type { ChatContext } from './chatPrompt'
import type { Transaction } from '@/db/types'

const ctx = (over: Partial<ChatContext> = {}): ChatContext => ({
  recentTransactions: [],
  monthExpense: 0,
  monthIncome: 0,
  lastMonthExpense: 0,
  todayExpense: 0,
  monthCategorySums: {},
  categoryMap: { food: '餐饮', transport: '交通' },
  ...over,
})

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  amount: 35,
  category: 'food',
  date: '2026-07-21',
  type: 'expense',
  note: '午餐',
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

describe('parseChatIntent', () => {
  it('record: 提取交易字段', () => {
    const raw = JSON.stringify({
      intent: 'record',
      transaction: { amount: 35, type: 'expense', category: 'food', date: '2026-07-21', time: null, note: '午餐' },
      reply: '好的,记一笔午餐 -¥35',
    })
    const r = parseChatIntent(raw)!
    expect(r.intent).toBe('record')
    expect(r.transaction).not.toBeNull()
    expect(r.transaction?.amount).toBe(35)
    expect(r.transaction?.category).toBe('food')
    expect(r.transaction?.type).toBe('expense')
    expect(r.reply).toBe('好的,记一笔午餐 -¥35')
  })

  it('record: 金额字符串与非法分类归一化', () => {
    const r = parseChatIntent(JSON.stringify({
      intent: 'record',
      transaction: { amount: '50', type: 'expense', category: '不存在的分类', date: '2026-07-21', time: '12:30', note: '打车' },
      reply: 'ok',
    }))!
    expect(r.transaction?.amount).toBe(50)
    expect(r.transaction?.category).toBe('other')
    expect(r.transaction?.time).toBe('12:30')
  })

  it('query: 返回 reply', () => {
    const r = parseChatIntent(JSON.stringify({ intent: 'query', reply: '本月支出 ¥1200' }))!
    expect(r.intent).toBe('query')
    expect(r.reply).toBe('本月支出 ¥1200')
    expect(r.transaction).toBeUndefined()
  })

  it('modify: 提取 txId 与 changes', () => {
    const r = parseChatIntent(JSON.stringify({
      intent: 'modify',
      txId: 42,
      changes: { amount: 20, category: 'transport' },
      reply: '已把那笔改成 ¥20 交通',
    }))!
    expect(r.intent).toBe('modify')
    expect(r.txId).toBe(42)
    expect(r.changes?.amount).toBe(20)
    expect(r.changes?.category).toBe('transport')
  })

  it('delete: 提取 txId', () => {
    const r = parseChatIntent(JSON.stringify({ intent: 'delete', txId: 7, reply: '已删除' }))!
    expect(r.intent).toBe('delete')
    expect(r.txId).toBe(7)
  })

  it('chat: 仅 reply', () => {
    const r = parseChatIntent(JSON.stringify({ intent: 'chat', reply: '你好呀' }))!
    expect(r.intent).toBe('chat')
    expect(r.reply).toBe('你好呀')
  })

  it('非法 intent 回退为 chat', () => {
    const r = parseChatIntent(JSON.stringify({ intent: 'unknown', reply: 'x' }))!
    expect(r.intent).toBe('chat')
  })

  it('缺失 reply 时为空字符串', () => {
    const r = parseChatIntent(JSON.stringify({ intent: 'chat' }))!
    expect(r.reply).toBe('')
  })

  it('非法 JSON 返回 null', () => {
    expect(parseChatIntent('not json')).toBeNull()
    expect(parseChatIntent('')).toBeNull()
  })

  it('带 markdown 代码块也能提取', () => {
    const raw = '```json\n{"intent":"chat","reply":"hi"}\n```'
    // 代码块场景:正则 \{[\s\S]*\} 兜底
    const r = parseChatIntent(raw)!
    expect(r.intent).toBe('chat')
    expect(r.reply).toBe('hi')
  })

  it('modify 但 txId 非数字时忽略 txId', () => {
    const r = parseChatIntent(JSON.stringify({ intent: 'modify', txId: 'abc', changes: { amount: 10 }, reply: 'x' }))!
    expect(r.txId).toBeUndefined()
    expect(r.changes?.amount).toBe(10)
  })
})

describe('buildContextBlock', () => {
  it('包含日期、月度汇总与最近交易', () => {
    const block = buildContextBlock(ctx({
      monthExpense: 1200,
      monthIncome: 5000,
      lastMonthExpense: 900,
      todayExpense: 35,
      monthCategorySums: { food: 300, transport: 100 },
      recentTransactions: [tx({ id: 5, note: '午餐', amount: 35 })],
    }))
    expect(block).toContain('本月支出 ¥1200.00')
    expect(block).toContain('收入 ¥5000.00')
    expect(block).toContain('上月支出 ¥900.00')
    expect(block).toContain('今日支出 ¥35.00')
    expect(block).toContain('餐饮 ¥300.00')
    expect(block).toContain('id=5')
    expect(block).toContain('午餐')
  })

  it('无交易时显示暂无', () => {
    const block = buildContextBlock(ctx())
    expect(block).toContain('暂无')
  })
})

describe('buildChatMessages', () => {
  it('system 在首,历史截断到最近 10 条', () => {
    const history = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))
    const msgs = buildChatMessages(history, ctx())
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('MoneyNote 记账助手')
    // system + 最多 10 条历史
    expect(msgs.length).toBe(11)
    expect(msgs[1].content).toBe('m5')
    expect(msgs[10].content).toBe('m14')
  })
})
