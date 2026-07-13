import { normalize } from './normalizer'
import { extractAmount } from './amountExtractor'
import { parseDate } from './dateParser'

// 填充动词/短语（从长到短排列，贪心匹配）
const FILLER_PATTERNS = [
  /花了/g,
  /花费/g,
  /用了/g,
  /消费/g,
  /支付/g,
  /付了/g,
  /买了/g,
  /花(?=\s|$)/g,   // 仅匹配末尾或空白前的"花"
  /用(?=\s|$)/g,
  /付(?=\s|$)/g,
  /买(?=\s|$)/g,
]

// 末尾语气词（仅在文本末尾移除）
const TRAILING_PARTICLES = /[了的地啊呀呢吧哦嘛哈]+$/g

/**
 * 将用户原始输入标准化为缓存键。
 *
 * 管道：normalize → 移除金额 → 移除日期 → 移除填充词 → 空白压缩
 *
 * 目标：语义相同的输入映射到同一 cacheKey
 * - "午餐花了35" / "午餐 花了 35" → "午餐"
 * - "星巴克咖啡38" → "星巴克咖啡"
 * - "昨天晚饭80" → "晚饭"
 */
export function generateCacheKey(rawInput: string): string {
  if (!rawInput || !rawInput.trim()) return ''

  // 第一层：复用现有 normalize（全角→半角、货币统一、小写、空白压缩）
  let text = normalize(rawInput)

  // 第二层：移除金额表达
  const amountResult = extractAmount(text)
  if (amountResult.matchedText) {
    text = text.replace(amountResult.matchedText, ' ')
  }

  // 第三层：移除日期表达（仅当 matchedText 非空时）
  const dateResult = parseDate(text)
  if (dateResult.matchedText) {
    text = text.replace(dateResult.matchedText, ' ')
  }

  // 第四层：移除填充动词/短语
  for (const pattern of FILLER_PATTERNS) {
    text = text.replace(pattern, ' ')
  }

  // 第五层：移除末尾语气词
  text = text.replace(TRAILING_PARTICLES, '')

  // 最终清理：空白压缩 + trim
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

/**
 * 检查原始输入是否包含明确的日期表达。
 * 用于缓存写入时决定是否保留 result.date。
 */
export function hasExplicitDate(rawInput: string): boolean {
  const normalized = normalize(rawInput)
  const dateResult = parseDate(normalized)
  return dateResult.matchedText.length > 0
}
