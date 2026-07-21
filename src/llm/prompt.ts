import dayjs from 'dayjs'
import type { LLMParseResult } from './types'
import { VALID_CATEGORIES, VALID_INCOME_CATEGORIES, ALL_CATEGORIES, validCategoriesFor } from './types'

const EXPENSE_LIST = VALID_CATEGORIES.join(', ')
const INCOME_LIST = VALID_INCOME_CATEGORIES.join(', ')
const ALL_LIST = ALL_CATEGORIES.join(', ')

const SYSTEM_PROMPT_TEMPLATE = `你是 MoneyNote 记账助手的结构化数据提取引擎。用户会用中文输入一句记账描述，你需要提取以下字段并返回严格的 JSON。

## 输出格式
{
  "amount": <number|null>,
  "type": "expense"|"income",
  "category": "<category_id>",
  "date": "YYYY-MM-DD",
  "time": "HH:mm"|null,
  "note": "<string>",
  "confidence": <0-1 number>
}

## 规则
1. 只返回 JSON，不要任何解释、markdown 代码块或额外文本
2. category 必须与 type 匹配：支出(type=expense)用 ${EXPENSE_LIST}；收入(type=income)用 ${INCOME_LIST}
3. amount 必须是正数。收入场景(工资、报销、收款、红包等)时 type 为 "income"
4. 今天是 {today}，昨天是 {yesterday}。未提及日期则用 {today}
5. note 应简短，去除冗余动词如"花了""买了""付了"，保留关键信息
6. confidence 表示你对解析结果的把握程度，0 为完全不确定，1 为完全确定`

// 构建消息数组
export function buildMessages(userInput: string): Array<{ role: string; content: string }> {
  const today = dayjs().format('YYYY-MM-DD')
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace(/\{today\}/g, today)
    .replace(/\{yesterday\}/g, yesterday)

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput },
  ]
}

// 解析 LLM 响应（三层 fallback）
export function parseLLMResponse(raw: string): LLMParseResult | null {
  if (!raw || !raw.trim()) return null

  // 尝试 1：直接 JSON.parse
  let parsed = tryParse(raw.trim())

  // 尝试 2：提取 ```json ... ``` 代码块
  if (!parsed) {
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      parsed = tryParse(codeBlockMatch[1].trim())
    }
  }

  // 尝试 3：提取第一个 { ... } 块
  if (!parsed) {
    const braceMatch = raw.match(/\{[\s\S]*\}/)
    if (braceMatch) {
      parsed = tryParse(braceMatch[0])
    }
  }

  if (!parsed) return null

  return validateAndNormalize(parsed)
}

// 安全 JSON.parse
function tryParse(str: string): Record<string, unknown> | null {
  try {
    const result = JSON.parse(str)
    return typeof result === 'object' && result !== null ? result : null
  } catch {
    return null
  }
}

// 字段校验与规范化
function validateAndNormalize(parsed: Record<string, unknown>): LLMParseResult | null {
  // amount
  let amount: number | null = null
  if (typeof parsed.amount === 'number' && parsed.amount > 0) {
    amount = parsed.amount
  } else if (typeof parsed.amount === 'string') {
    const n = parseFloat(parsed.amount)
    if (!isNaN(n) && n > 0) amount = n
  }

  // type
  const type = parsed.type === 'income' ? 'income' : 'expense'

  // category（按 type 校验）
  const validCats = validCategoriesFor(type)
  let category = type === 'income' ? 'income_other' : 'other'
  if (typeof parsed.category === 'string' && validCats.includes(parsed.category)) {
    category = parsed.category
  }

  // date
  let date = dayjs().format('YYYY-MM-DD')
  if (typeof parsed.date === 'string' && dayjs(parsed.date, 'YYYY-MM-DD', true).isValid()) {
    date = parsed.date
  }

  // time
  let time: string | null = null
  if (typeof parsed.time === 'string' && /^\d{2}:\d{2}$/.test(parsed.time)) {
    time = parsed.time
  }

  // note
  const note = typeof parsed.note === 'string' ? parsed.note.trim() : ''

  // confidence
  let confidence = 0.5
  if (typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1) {
    confidence = parsed.confidence
  }

  return { amount, type, category, date, time, note, confidence }
}

// ── 批量分类 Prompt ──

const BATCH_SYSTEM_PROMPT = `你是一个交易分类引擎。请对以下交易描述进行分类。

## 规则
1. 只返回 JSON 数组，不要任何解释或 markdown
2. 每个元素的 category 必须是: ${ALL_LIST}（按交易内容选收支分类，如退款/工资等收入用 salary/refund 等）
3. confidence 表示把握程度 (0-1)
4. 数组长度必须与输入数量完全一致

## 输出格式
[{"category":"food","confidence":0.9},{"category":"transport","confidence":0.8}]`

// 构建批量分类消息
export function buildBatchMessages(items: string[]): Array<{ role: string; content: string }> {
  const numbered = items.map((item, i) => `${i + 1}. "${item}"`).join('\n')
  return [
    { role: 'system', content: BATCH_SYSTEM_PROMPT },
    { role: 'user', content: `请分类以下 ${items.length} 条交易：\n${numbered}` },
  ]
}

// 批量分类结果类型
export interface BatchClassifyItem {
  category: string
  confidence: number
}

// 解析批量分类响应
export function parseBatchResponse(raw: string, expectedCount: number): (BatchClassifyItem | null)[] {
  if (!raw || !raw.trim()) return new Array(expectedCount).fill(null)

  // 提取 JSON 数组
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

  return parsed.slice(0, expectedCount).map((item: unknown) => {
    if (typeof item !== 'object' || item === null) return null
    const obj = item as Record<string, unknown>
    const category = typeof obj.category === 'string' && (ALL_CATEGORIES as readonly string[]).includes(obj.category)
      ? obj.category
      : 'other'
    const confidence = typeof obj.confidence === 'number' && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : 0.5
    return { category, confidence }
  })
}
