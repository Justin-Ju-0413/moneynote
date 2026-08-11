import { db } from '@/db'
import type { LearningRule } from '@/db/types'
import * as log from '@/utils/log'

// 渠道前缀剔除（提炼关键词用）：从商户文本中剥离支付渠道前缀
const CHANNEL_PREFIXES = [
  '银联渠道他代本借记卡无卡交易', '财付通-', '支付宝（中国）网络技术有限公司-',
  '支付宝(中国)网络技术有限公司-', '微信支付-', '云闪付-',
]

export function stripChannelPrefix(text: string): string {
  let t = text.trim()
  for (const p of CHANNEL_PREFIXES) {
    if (t.startsWith(p)) { t = t.slice(p.length).trim(); break }
  }
  return t
}

export async function recordLearning(
  merchant: string,
  category: string,
  source: 'llm' | 'manual',
  confidence = 1,
): Promise<void> {
  const key = merchant.trim()
  if (!key) return
  const existing = await db.learningRules.where('merchant').equals(key).first()

  if (existing) {
    // manual 优先：llm 结果不覆盖 manual；manual 可覆盖 llm 并升级
    if (existing.source === 'manual' && source === 'llm') return
    const updates: Partial<LearningRule> = {
      category: source === 'manual' ? category : existing.category,
      source: source === 'manual' ? 'manual' : existing.source,
      hitCount: existing.hitCount + 1,
      confidence: Math.max(existing.confidence, confidence),
      updatedAt: Date.now(),
    }
    await db.learningRules.update(existing.id!, updates)
    const merged = { ...existing, ...updates, id: existing.id }
    await promoteToKeyword(merged)
  } else {
    const id = await db.learningRules.add({
      merchant: key, category, source, confidence,
      hitCount: 1, createdAt: Date.now(), updatedAt: Date.now(),
    })
    await promoteToKeyword({ id, merchant: key, category, source, confidence, hitCount: 1, createdAt: Date.now(), updatedAt: Date.now() })
  }
}

export async function matchLearningRule(merchant: string): Promise<LearningRule | null> {
  const key = merchant.trim()
  if (!key) return null
  // 注意必须 await 后再 ?? null：直接 return promise ?? null 时 promise 为 truthy，
  // ?? 不生效，未命中会返回 undefined 而非 null（违反接口契约）
  return (await db.learningRules.where('merchant').equals(key).first()) ?? null
}

// 命中计量（B3）：matchCount+1 / lastHitAt=now。失败仅告警，不得打断识别链路
export async function recordRuleHit(rule: LearningRule): Promise<void> {
  try {
    await db.learningRules.update(rule.id!, {
      matchCount: (rule.matchCount ?? 0) + 1,
      lastHitAt: Date.now(),
    })
  } catch (err) { log.warn('规则命中计量失败', err) }
}

export async function listLearningRules(): Promise<LearningRule[]> {
  return db.learningRules.orderBy('updatedAt').reverse().toArray()
}

export async function deleteLearningRule(id: number): Promise<void> {
  await db.learningRules.delete(id)
}

// 分类通用后缀词典：提炼关键词时循环剥离末尾后缀，保留品牌核心词（如「汉庭酒店住宿」→「汉庭」）
const SUFFIX_DICT: Record<string, string[]> = {
  housing: ['酒店', '住宿', '公寓', '宾馆', '民宿', '客栈'],
  entertainment: ['酒店', '民宿'],
  food: ['餐厅', '饭店', '小馆', '小吃', '快餐'],
  transport: ['租车', '打车', '出行', '公司'],
  shopping: ['商场', '超市', '便利店', '商店', '旗舰店'],
}

// 提炼门槛：manual ≥1 次；llm ≥3 次。提炼词 ≥2 字，先剥渠道前缀再按分类剥通用后缀取核心词，
// 写入分类 keywords（去重）；剥完只剩后缀词本身（如「酒店」）或核心词 <2 字则不提炼
export async function promoteToKeyword(rule: LearningRule): Promise<boolean> {
  const threshold = rule.source === 'manual' ? 1 : 3
  if (rule.hitCount < threshold) return false

  let core = stripChannelPrefix(rule.merchant)
  const suffixes = SUFFIX_DICT[rule.category] ?? []
  // 循环剥（每剥一次从头重查）：「汉庭酒店住宿」→ 剥「住宿」→ 剥「酒店」→「汉庭」
  let changed = true
  while (changed) {
    changed = false
    for (const suffix of suffixes) {
      if (core.endsWith(suffix)) {
        core = core.slice(0, -suffix.length).trim()
        changed = true
        break
      }
    }
  }
  if (core.length < 2) return false

  const cat = await db.categories.get(rule.category)
  if (!cat) return false
  if (cat.keywords.includes(core)) return false

  const keywords = [...cat.keywords, core]
  await db.categories.update(cat.id!, { keywords })
  return true
}
