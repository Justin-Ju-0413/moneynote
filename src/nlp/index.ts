import type { ParsedTransaction } from '@/db/types'
import type { LLMParseResult } from '@/llm/types'
import { normalize } from './normalizer'
import { extractAmount } from './amountExtractor'
import { parseDate } from './dateParser'
import { matchCategory } from './categoryMatcher'
import { cleanNote } from './noteCleaner'

// 收入关键词：命中则 type='income'（默认 expense）
const INCOME_KEYWORDS = [
  '工资', '薪水', '薪资', '收入', '报销', '红包', '奖金', '兼职',
  '分红', '利息', '津贴', '补贴', '退休金', '养老金', '中奖', '收益',
  '酬劳', '报酬', '稿费', '佣金', '抚恤金', '抚养费', '租金收入',
  'salary', 'wage', 'income', 'bonus', 'refund',
]

function detectIncome(text: string): boolean {
  const lower = text.toLowerCase()
  return INCOME_KEYWORDS.some(k => lower.includes(k.toLowerCase()))
}

export function parseInput(rawInput: string): ParsedTransaction {
  if (!rawInput.trim()) {
    return {
      amount: null,
      amountConfidence: 'low',
      category: 'other',
      categoryConfidence: 'low',
      date: new Date().toISOString().split('T')[0],
      time: null,
      note: '',
      rawInput,
      type: 'expense',
      needsReview: true,
    }
  }

  // 阶段 1：文本标准化
  const normalized = normalize(rawInput)

  // 阶段 2：日期提取
  const dateResult = parseDate(normalized)

  // 阶段 3：金额提取
  const amountResult = extractAmount(normalized)

  // 阶段 4：分类匹配
  const categoryResult = matchCategory(normalized)

  // 阶段 5：备注清理
  const note = cleanNote(normalized, dateResult.matchedText, amountResult.matchedText)

  // 判断是否需要用户确认
  const needsReview =
    amountResult.amount === null ||
    amountResult.confidence === 'low' ||
    categoryResult.confidence === 'low'

  // 收入识别（关键词命中则为收入）
  const type: 'expense' | 'income' = detectIncome(normalized) ? 'income' : 'expense'

  return {
    amount: amountResult.amount,
    amountConfidence: amountResult.confidence,
    category: categoryResult.category,
    categoryConfidence: categoryResult.confidence,
    date: dateResult.date,
    time: dateResult.time,
    note,
    rawInput,
    type,
    needsReview,
  }
}

export { normalize } from './normalizer'
export { extractAmount } from './amountExtractor'
export { parseDate } from './dateParser'
export { matchCategory } from './categoryMatcher'
export { cleanNote } from './noteCleaner'
export { generateCacheKey, hasExplicitDate } from './cacheKeyNormalizer'

// 判断规则结果是否需要 LLM 增强
export function needsLLMEnhancement(result: ParsedTransaction): boolean {
  return result.needsReview ||
    result.amountConfidence === 'low' ||
    result.categoryConfidence === 'low'
}

// 将 LLM 结果合并到规则结果
export function mergeLLMResult(
  ruleResult: ParsedTransaction,
  llmResult: LLMParseResult
): ParsedTransaction {
  const merged = { ...ruleResult }

  if (llmResult.confidence >= 0.7) {
    if (ruleResult.amountConfidence === 'low' && llmResult.amount !== null) {
      merged.amount = llmResult.amount
      merged.amountConfidence = 'high'
    }
    if (ruleResult.categoryConfidence === 'low' && llmResult.category !== 'other') {
      merged.category = llmResult.category
      merged.categoryConfidence = 'high'
    }
  }

  // 补充规则引擎缺失的字段
  if (merged.amount === null && llmResult.amount !== null) {
    merged.amount = llmResult.amount
    merged.amountConfidence = 'medium'
  }
  if (llmResult.time && !merged.time) {
    merged.time = llmResult.time
  }
  if (llmResult.note && !merged.note) {
    merged.note = llmResult.note
  }

  // type：规则检测到收入则保留，否则采纳 LLM 的 income 判定
  merged.type = merged.type === 'income' || llmResult.type === 'income' ? 'income' : 'expense'

  merged.needsReview = merged.amount === null ||
    merged.amountConfidence === 'low' ||
    merged.categoryConfidence === 'low'

  return merged
}
