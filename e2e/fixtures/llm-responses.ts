// E2E mock LLM 响应构造器:按意图返回应用 chatPrompt 约定的严格 JSON
function today(): string {
  return new Date().toISOString().split('T')[0]
}

// record:从用户消息动态提取金额与备注,与断言保持一致
export function recordResponse(lastUser: string) {
  const amountMatch = lastUser.match(/(\d+\.?\d*)/)
  const amount = amountMatch ? Number(amountMatch[1]) : 15
  const note = lastUser.replace(amountMatch?.[0] ?? '', '').trim()
  return {
    intent: 'record',
    transaction: {
      amount, type: 'expense', category: 'transport',
      date: today(), time: null, note,
    },
    reply: `记一笔${note}支出 ¥${amount}?`,
  }
}

export function queryResponse() {
  return { intent: 'query', reply: '本月共支出¥15.00' }
}

export function modifyResponse(txId: number) {
  return {
    intent: 'modify', txId,
    changes: { amount: 50 },
    reply: '把刚才那笔改成50?',
  }
}

export function deleteResponse(txId: number) {
  return { intent: 'delete', txId, reply: '删除这笔?' }
}

export function auditResponse(task: 'audit' | 'categorize' | 'dedupe' | 'analyzeMonth', payload: { transactions: { id: number }[] }) {
  const ids = payload.transactions?.map((t) => t.id) ?? []
  if (task === 'dedupe') {
    return {
      suggestions: ids.length >= 2
        ? [{ type: 'duplicate', transactionIds: ids.slice(0, 2), result: '疑似重复流水', confidence: 0.9, reason: '同日同金额同方向' }]
        : [],
    }
  }
  if (task === 'categorize') {
    return {
      suggestions: ids.slice(0, 1).map((id) => ({
        type: 'category', transactionIds: [id], result: 'food', confidence: 0.9, reason: '备注含餐饮关键词',
      })),
    }
  }
  // audit:一条分类建议即可驱动「应用」按钮
  return {
    suggestions: ids.slice(0, 1).map((id) => ({
      type: 'category', transactionIds: [id], result: 'food', confidence: 0.9, reason: '综合审计发现可归类',
    })),
  }
}

// 单条解析/测试连接兜底
export function parseResponse() {
  return {
    amount: 10, category: 'food', type: 'expense',
    date: today(), time: null, note: '测试', confidence: 0.9,
  }
}
