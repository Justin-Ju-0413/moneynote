import type { ColumnRole } from '@/db/types'

// ── AI 列映射 System Prompt ──

const MAPPING_SYSTEM_PROMPT = `你是一个账单文件列映射识别引擎。给定一个表格的表头和样本数据行，你需要识别每列的语义角色。

## 已知角色
- date: 交易日期/时间列（如 "2024-03-15" 或 "2024-03-15 14:30:00"）
- amount: 交易金额列（如 "¥128.50" 或 "-35.0" 或 "1,200.00"）
- direction: 收支方向列（值为 "收入"/"支出"，或 "借"/"贷"，或 "/" 表示不计）
- note: 交易备注/商品描述/摘要/交易渠道描述
- counterparty: 交易对方/商户名称/交易对手户名
- category: 交易分类（如 "餐饮美食"、"交通出行"）
- status: 交易状态（如 "交易成功"、"交易关闭"）
- balance: 账户余额列
- skip: 无关列（序号、网点、交易地点等）

## 规则
1. date 和 amount 必须各恰好有一列
2. direction 可以为 null（当金额用正负号表示方向时无需独立方向列）
3. 只返回 JSON 数组，不要任何解释、markdown 代码块或额外文本
4. 数组长度必须与输入的表头数量完全一致

## 输出格式
[{"role":"date","confidence":0.95},{"role":"amount","confidence":0.9},...]`

// ── 构建消息 ──

export function buildMappingMessages(
  headers: string[],
  sampleRows: string[][],
  knownRoles: (ColumnRole | null)[],
): Array<{ role: string; content: string }> {
  // 构建样本描述
  const headerLine = `表头: ${JSON.stringify(headers)}`
  const sampleLines = sampleRows
    .slice(0, 5)
    .map((row, i) => `样本行${i + 1}: ${JSON.stringify(row)}`)
    .join('\n')

  // 附加已知角色信息
  const knownParts: string[] = []
  knownRoles.forEach((role, idx) => {
    if (role && role !== 'skip') {
      knownParts.push(`列${idx}(${headers[idx]})=${role}`)
    }
  })
  const knownLine = knownParts.length > 0
    ? `\n已知角色: ${knownParts.join(', ')}`
    : ''

  return [
    { role: 'system', content: MAPPING_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `请识别以下 ${headers.length} 列的语义角色：\n${headerLine}\n${sampleLines}${knownLine}`,
    },
  ]
}

// ── 解析响应 ──

export interface MappingResult {
  role: string
  confidence: number
}

export function parseMappingResponse(
  raw: string,
  expectedCount: number,
): (MappingResult | null)[] {
  if (!raw || !raw.trim()) return new Array(expectedCount).fill(null)

  let parsed: unknown = null

  // 尝试 1: 直接 parse
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    // 尝试 2: 提取 ```json ... ``` 代码块
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlock) {
      try { parsed = JSON.parse(codeBlock[1].trim()) } catch { /* noop */ }
    }
    // 尝试 3: 提取第一个 [...] 块
    if (!parsed) {
      const bracket = raw.match(/\[[\s\S]*\]/)
      if (bracket) {
        try { parsed = JSON.parse(bracket[0]) } catch { /* noop */ }
      }
    }
  }

  if (!Array.isArray(parsed)) return new Array(expectedCount).fill(null)

  const VALID_ROLES: ColumnRole[] = ['date', 'amount', 'direction', 'note', 'counterparty', 'category', 'status', 'balance', 'skip']

  return parsed.slice(0, expectedCount).map((item: unknown) => {
    if (typeof item !== 'object' || item === null) return null
    const obj = item as Record<string, unknown>
    const role = typeof obj.role === 'string' && VALID_ROLES.includes(obj.role as ColumnRole)
      ? obj.role
      : 'skip'
    const confidence = typeof obj.confidence === 'number' && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : 0.5
    return { role, confidence }
  })
}
