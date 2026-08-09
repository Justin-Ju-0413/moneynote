import { db } from '@/db'
import { matchCategory } from './categoryMatcher'
import { matchLearningRule } from './learningRules'
import type { LearningRule } from '@/db/types'

// 从 db.categories 构建自定义关键词字典（含内置分类、用户编辑扩充）
export async function buildKeywordDict(type: 'expense' | 'income'): Promise<Record<string, string[]>> {
  // 注：categories 表无 type 索引（schema: 'id, sortOrder'），Dexie where('type') 会抛 SchemaError，
  // 改用 filter() 内存过滤（内置+用户分类总数 <100 条，无性能问题）
  const cats = await db.categories.filter((c) => c.type === type).toArray()
  const dict: Record<string, string[]> = {}
  for (const c of cats) {
    if (c.keywords.length > 0) dict[c.id] = [...c.keywords]
  }
  return dict
}

export interface ChainResult {
  category: string
  confidence: 'high' | 'medium' | 'low'
  matchedKeyword: string
  rule?: LearningRule
}

// 匹配链：学习规则（精确→包含）→ 关键词（自定义+内置）→ low（由调用方决定 LLM）
export async function classifyWithChain(text: string, type: 'expense' | 'income'): Promise<ChainResult> {
  // 1. 学习规则匹配：精确优先；未命中退化为包含匹配（text 包含 rule.merchant，最长优先）。
  //    真实账单文本常带后缀（如 '格林豪泰酒店'），须能命中用户学过的 '格林豪泰' 规则。
  //    matchLearningRule 保持精确契约（Task 2 测试固定），包含匹配在此处实现。
  let rule = await matchLearningRule(text)
  if (!rule) {
    const candidates = await db.learningRules
      .filter((r) => r.merchant.length > 0 && text.includes(r.merchant))
      .toArray()
    if (candidates.length > 0) {
      // 最长 merchant 最具体；learningRules 的 merchant 由 recordLearning 保证唯一，同长必同条
      candidates.sort((a, b) => b.merchant.length - a.merchant.length)
      rule = candidates[0]
    }
  }
  if (rule) {
    return { category: rule.category, confidence: 'high', matchedKeyword: rule.merchant, rule }
  }

  // 2. 关键词匹配：自定义（db.categories）+ 内置
  const dict = await buildKeywordDict(type)
  const result = matchCategory(text, type, dict)
  return {
    category: result.category,
    confidence: result.confidence,
    matchedKeyword: result.matchedKeyword,
  }
}
