import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useChat, useChatStreamText } from './useChat'
import { db } from '@/db'
import { runChat } from '@/llm/service'
import type { ChatIntentResult } from '@/llm/chatPrompt'

// LLM 服务整体 mock：useChat 只依赖 runChat；testLLMConnection 供 useLLMSettings 引用
vi.mock('@/llm/service', () => ({
  runChat: vi.fn(),
  testLLMConnection: vi.fn(async () => ({ success: true, message: 'ok' })),
}))

// crypto 部分 mock：decryptApiKey 恒返回明文 key，避免真实 AES-GCM 依赖
vi.mock('@/llm/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm/crypto')>()
  return { ...actual, decryptApiKey: vi.fn(async () => 'sk-test-key') }
})

const runChatMock = vi.mocked(runChat)

async function seedLLMSettings() {
  await db.settings.bulkPut([
    { key: 'llm.enabled', value: true },
    { key: 'llm.endpoint', value: 'https://api.test' },
    { key: 'llm.apiKey', value: 'encrypted-blob' },
    { key: 'llm.model', value: 'gpt-test' },
  ])
}

function recordIntent(over: Partial<ChatIntentResult> = {}): ChatIntentResult {
  return {
    intent: 'record',
    reply: '帮你记好了，确认一下？',
    transaction: {
      amount: 15, category: 'transport', date: '2026-09-15', time: null,
      note: '打车', type: 'expense', confidence: 0.9,
    },
    ...over,
  }
}

describe('useChat（本地 NLP 路径）', () => {
  beforeEach(async () => {
    runChatMock.mockReset()
    await Promise.all([
      db.chatMessages.clear(), db.transactions.clear(), db.settings.clear(),
      db.learningRules.clear(),
    ])
    // settings 清空后重新写入非 LLM 默认值（enabled=false）
    await db.settings.put({ key: 'llm.enabled', value: false })
  })

  it('aiEnabled=false（未配置 LLM）', async () => {
    const { result } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.aiEnabled).toBe(false))
  })

  it('本地 NLP 命中「打车15」→ 免 LLM 产出 pending 确认卡', async () => {
    const { result } = renderHook(() => useChat())
    await act(async () => { await result.current.sendMessage('打车15') })

    expect(runChatMock).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.messages).toHaveLength(2))

    const [userMsg, assistantMsg] = result.current.messages
    expect(userMsg.role).toBe('user')
    expect(userMsg.content).toBe('打车15')
    expect(assistantMsg.role).toBe('assistant')
    expect(assistantMsg.intent).toBe('record')
    expect(assistantMsg.card?.kind).toBe('record')
    expect(assistantMsg.card?.status).toBe('pending')
    expect(assistantMsg.card?.parsed?.amount).toBe(15)
    expect(assistantMsg.card?.parsed?.category).toBe('transport')
    expect(assistantMsg.card?.parsed?.type).toBe('expense')
  })

  it('本地 NLP 未命中金额 → chat 意图无卡片', async () => {
    const { result } = renderHook(() => useChat())
    await act(async () => { await result.current.sendMessage('你好呀') })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    const assistantMsg = result.current.messages[1]
    expect(assistantMsg.intent).toBe('chat')
    expect(assistantMsg.card).toBeUndefined()
    expect(assistantMsg.content).toContain('AI 未启用')
  })

  it('空白输入直接忽略，不产生消息', async () => {
    const { result } = renderHook(() => useChat())
    await act(async () => { await result.current.sendMessage('   ') })
    // liveQuery 异步刷新，给一拍时间后仍应为空
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(result.current.messages).toHaveLength(0)
  })

  it('确认卡片 → 交易落库 + 学习规则沉淀 + 状态流转 confirmed', async () => {
    const { result } = renderHook(() => useChat())
    await act(async () => { await result.current.sendMessage('打车15') })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    const msgId = result.current.messages[1].id as number

    await act(async () => { await result.current.confirmCard(msgId) })

    const txs = await db.transactions.toArray()
    expect(txs).toHaveLength(1)
    expect(txs[0]).toMatchObject({ amount: 15, category: 'transport', type: 'expense' })
    expect((await db.chatMessages.get(msgId))?.card?.status).toBe('confirmed')
    // 学习：merchant（note/rawInput）→ transport 的 manual 规则
    expect(await db.learningRules.where('merchant').equals('打车').count()).toBeGreaterThanOrEqual(1)
  })

  it('重复确认不重复落库（非 pending 直接返回）', async () => {
    const { result } = renderHook(() => useChat())
    await act(async () => { await result.current.sendMessage('打车15') })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    const msgId = result.current.messages[1].id as number
    await act(async () => { await result.current.confirmCard(msgId) })
    await act(async () => { await result.current.confirmCard(msgId) })
    expect(await db.transactions.count()).toBe(1)
  })

  it('取消卡片 → 状态 cancelled 且不落库', async () => {
    const { result } = renderHook(() => useChat())
    await act(async () => { await result.current.sendMessage('打车15') })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    const msgId = result.current.messages[1].id as number

    await act(async () => { await result.current.cancelCard(msgId) })

    expect(await db.transactions.count()).toBe(0)
    expect((await db.chatMessages.get(msgId))?.card?.status).toBe('cancelled')
  })

  it('clearMessages 清空消息表', async () => {
    const { result } = renderHook(() => useChat())
    await act(async () => { await result.current.sendMessage('打车15') })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    await act(async () => { await result.current.clearMessages() })
    await waitFor(() => expect(result.current.messages).toHaveLength(0))
  })
})

describe('useChat（LLM 路径）', () => {
  beforeEach(async () => {
    runChatMock.mockReset()
    await Promise.all([
      db.chatMessages.clear(), db.transactions.clear(), db.settings.clear(),
      db.learningRules.clear(),
    ])
    await seedLLMSettings()
  })

  it('启用 LLM 后 aiEnabled=true 且走 runChat', async () => {
    runChatMock.mockResolvedValue({ result: recordIntent(), error: undefined })
    const { result } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.aiEnabled).toBe(true))

    await act(async () => { await result.current.sendMessage('打车15') })

    expect(runChatMock).toHaveBeenCalledTimes(1)
    // 传入的 history 包含刚写入的用户消息
    const history = runChatMock.mock.calls[0][1]
    expect(history.at(-1)).toEqual({ role: 'user', content: '打车15' })

    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.messages[1].card?.kind).toBe('record')
    expect(result.current.messages[1].card?.status).toBe('pending')
  })

  it('sending 状态：请求中为 true，结束后回落 false', async () => {
    let release!: (v: { result: ChatIntentResult; error?: string }) => void
    runChatMock.mockImplementation(async () => {
      await new Promise<{ result: ChatIntentResult; error?: string }>((r) => { release = r })
      return { result: recordIntent(), error: undefined }
    })
    const { result } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.aiEnabled).toBe(true))
    expect(result.current.sending).toBe(false)

    let sent!: Promise<void>
    act(() => { sent = result.current.sendMessage('打车15') })
    await waitFor(() => expect(result.current.sending).toBe(true))
    await act(async () => { release({ result: recordIntent(), error: undefined }) })
    await act(async () => { await sent })
    expect(result.current.sending).toBe(false)
  })

  it('流式增量通过 useChatStreamText 暴露，结束后清空', async () => {
    let release!: () => void
    runChatMock.mockImplementation(async (_cfg, _history, _ctx, onProgress) => {
      onProgress?.('{"reply": "正')
      onProgress?.('在记录')
      await new Promise<void>((r) => { release = r })
      return { result: recordIntent(), error: undefined }
    })
    const chat = renderHook(() => useChat())
    const stream = renderHook(() => useChatStreamText())
    await waitFor(() => expect(chat.result.current.aiEnabled).toBe(true))

    let sent!: Promise<void>
    act(() => { sent = chat.result.current.sendMessage('打车15') })
    await waitFor(() => expect(stream.result.current).toBe('正在记录'))
    await act(async () => { release() })
    await act(async () => { await sent })
    expect(stream.result.current).toBe('')
  })

  it('runChat 返回 result=null + error → AI 暂时不可用文案', async () => {
    runChatMock.mockResolvedValue({ result: null, error: '超时' })
    const { result } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.aiEnabled).toBe(true))
    await act(async () => { await result.current.sendMessage('这个月花了多少') })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    const assistantMsg = result.current.messages[1]
    expect(assistantMsg.content).toContain('AI 暂时不可用')
    expect(assistantMsg.content).toContain('超时')
    expect(assistantMsg.card).toBeUndefined()
  })

  it('runChat 抛异常 → 兜底「出错了」消息且 sending 复位', async () => {
    runChatMock.mockRejectedValue(new Error('网络断了'))
    const { result } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.aiEnabled).toBe(true))
    await act(async () => { await result.current.sendMessage('记账') })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.messages[1].content).toContain('出错了')
    expect(result.current.messages[1].content).toContain('网络断了')
    expect(result.current.sending).toBe(false)
  })

  it('modify 意图确认 → 按_changes 更新交易', async () => {
    const txId = await db.transactions.add({
      amount: 10, category: 'food', date: '2026-09-14', type: 'expense',
      note: '午餐', createdAt: Date.now(), updatedAt: Date.now(),
    })
    runChatMock.mockResolvedValue({
      result: { intent: 'modify', txId, changes: { amount: 99 }, reply: '改成 99 了' },
      error: undefined,
    })
    const { result } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.aiEnabled).toBe(true))
    await act(async () => { await result.current.sendMessage('把午餐改成99') })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))

    const msg = result.current.messages[1]
    expect(msg.card?.kind).toBe('modify')
    expect(msg.card?.snapshot?.amount).toBe(10)

    await act(async () => { await result.current.confirmCard(msg.id as number) })
    expect((await db.transactions.get(txId))?.amount).toBe(99)
  })

  it('delete 意图确认 → 删除交易', async () => {
    const txId = await db.transactions.add({
      amount: 10, category: 'food', date: '2026-09-14', type: 'expense',
      note: '午餐', createdAt: Date.now(), updatedAt: Date.now(),
    })
    runChatMock.mockResolvedValue({
      result: { intent: 'delete', txId, reply: '删掉这笔' },
      error: undefined,
    })
    const { result } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.aiEnabled).toBe(true))
    await act(async () => { await result.current.sendMessage('删掉午餐那笔') })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))

    const msg = result.current.messages[1]
    expect(msg.card?.kind).toBe('delete')
    await act(async () => { await result.current.confirmCard(msg.id as number) })
    expect(await db.transactions.get(txId)).toBeUndefined()
  })

  it('modify 目标不存在 → 回退 chat 文案不产卡', async () => {
    runChatMock.mockResolvedValue({
      result: { intent: 'modify', txId: 99999, changes: { amount: 1 }, reply: '好的' },
      error: undefined,
    })
    const { result } = renderHook(() => useChat())
    await waitFor(() => expect(result.current.aiEnabled).toBe(true))
    await act(async () => { await result.current.sendMessage('把那笔改成1') })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    const msg = result.current.messages[1]
    expect(msg.intent).toBe('chat')
    expect(msg.content).toContain('没找到')
  })
})
