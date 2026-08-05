import type { Page, Route } from '@playwright/test'
import { recordResponse, queryResponse, modifyResponse, deleteResponse, auditResponse, parseResponse, batchResponse } from '../fixtures/llm-responses'

export interface LLMCall {
  url: string
  system: string
  lastUser: string
}

export interface MockLLMHandle {
  calls: LLMCall[]
  count(): number
}

function chatResponse(lastUser: string, system: string): unknown {
  // modify/delete 需要 txId:从系统消息注入的「最近交易」里取第一条 id
  const idMatch = system.match(/id=(\d+) \|/)
  const txId = idMatch ? Number(idMatch[1]) : 1

  if (/删/.test(lastUser)) return deleteResponse(txId)
  if (/改/.test(lastUser)) return modifyResponse(txId)
  // 收窄 query 触发词:裸「花了/消费」是记账口语(如「打车花了30」),不路由到 query
  if (/多少|查询|本月/.test(lastUser)) return queryResponse()
  return recordResponse(lastUser)
}

function auditTaskFromSystem(system: string): 'audit' | 'categorize' | 'dedupe' | 'analyzeMonth' {
  if (system.includes('本次只找疑似重复')) return 'dedupe'
  if (system.includes('本次只做分类')) return 'categorize'
  if (system.includes('本次做月度摘要')) return 'analyzeMonth'
  return 'audit'
}

export async function mockLLM(page: Page): Promise<MockLLMHandle> {
  const calls: LLMCall[] = []
  await page.route('**/chat/completions', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { messages: { role: string; content: string }[] }
    const messages = body.messages ?? []
    const system = messages.find((m) => m.role === 'system')?.content ?? ''
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    calls.push({ url: route.request().url(), system, lastUser })

    let content: string
    // 分发顺序按标识特异性从高到低:「记账助手」是其他 prompt 的子串(如「记账助手的结构化数据提取引擎」),
    // 必须先匹配更具体的标识,否则单条解析会被错误路由到 chat 分支
    if (system.includes('结构化数据提取')) {
      // 单条解析(快速记账 / testLLMConnection):返回 LLMParseResult 形状
      content = JSON.stringify(parseResponse())
    } else if (system.includes('交易分类引擎')) {
      // 批量分类:返回分类数组,长度与输入条数一致
      const userContent = messages.find((m) => m.role === 'user')?.content ?? ''
      const countMatch = userContent.match(/以下\s*(\d+)\s*条/)
      const lineCount = userContent.split('\n').filter((l) => /^\s*\d+\./.test(l)).length
      const count = countMatch ? Number(countMatch[1]) : lineCount > 0 ? lineCount : 1
      content = JSON.stringify(batchResponse(count))
    } else if (system.includes('记账助手')) {
      content = JSON.stringify(chatResponse(lastUser, system))
    } else if (system.includes('个人账单审计助手')) {
      let payload: { transactions: { id: number }[] } = { transactions: [] }
      try {
        payload = JSON.parse(messages.find((m) => m.role === 'user')?.content ?? '{}') as { transactions: { id: number }[] }
      } catch { /* 保持空 payload */ }
      content = JSON.stringify(auditResponse(auditTaskFromSystem(system), payload))
    } else {
      content = JSON.stringify(parseResponse())
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content } }] }),
    })
  })
  return { calls, count: () => calls.length }
}
