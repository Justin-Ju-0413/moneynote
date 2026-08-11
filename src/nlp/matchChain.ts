import { db } from '@/db'
import { matchCategory } from './categoryMatcher'
import { matchLearningRule, recordRuleHit, stripChannelPrefix } from './learningRules'
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
  // 1. 学习规则匹配：精确优先；未命中退化为包含匹配（text 包含规则核心词，最长优先）。
  //    真实账单文本常带后缀（如 '格林豪泰酒店'），须能命中用户学过的 '格林豪泰' 规则。
  //    matchLearningRule 保持精确契约（Task 2 测试固定），包含匹配在此处实现。
  //    归一化：规则 merchant 剥离渠道前缀后参与匹配（如 '财付通-美团' 可命中输入 '美团外卖'）；
  //    核心词 <2 字不参与（单字规则会误命中任何含该字的文本）。
  let rule = await matchLearningRule(text)
  if (!rule) {
    const candidates = await db.learningRules
      .filter((r) => {
        if (!r.merchant) return false
        const core = stripChannelPrefix(r.merchant)
        if (core.length < 2) return false
        return text.includes(core) || text.includes(r.merchant)
      })
      .toArray()
    if (candidates.length > 0) {
      // 核心词最长最具体；按长度降序稳定排序，等长时保持索引序，结果确定
      candidates.sort((a, b) => stripChannelPrefix(b.merchant).length - stripChannelPrefix(a.merchant).length)
      rule = candidates[0]
    }
  }
  if (rule) {
    // B3 命中计量（await 保证测试确定性；单次 IndexedDB 写，失败已内部隔离）
    await recordRuleHit(rule)
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
