export interface AmountResult {
  amount: number | null
  confidence: 'high' | 'medium' | 'low'
  matchedText: string
}

// 金额提取模式，按优先级排列
// group: matchedText 取哪个捕获组(默认 0=整匹配)。
// 「动词+数字」模式取 1=仅数字,避免 matchedText 吞掉前导助词"了"、被 cleanNote 连带误删
// (如"午餐吃了34"原 matchedText="了34",删后丢"了"成"午餐吃")。
const PATTERNS: Array<{
  pattern: RegExp
  confidence: 'high' | 'medium' | 'low'
  name: string
  group?: number
}> = [
  // P0: 数字+元/块/￥
  { pattern: /(\d+\.?\d*)\s*[元块]/, confidence: 'high', name: '数字+元' },
  // P1: 花了/花费/用了/支付/付了+数字(matchedText 仅取数字,保留助词"了")
  { pattern: /[花用消费支付付了花了]+\s*(\d+\.?\d*)/, confidence: 'high', name: '动词+数字', group: 1 },
  // P2: ¥/￥前缀
  { pattern: /[¥￥]\s*(\d+\.?\d*)/, confidence: 'high', name: '货币符号' },
  // P3: 数字+元(空格分隔)
  { pattern: /(\d+\.?\d*)\s*元/, confidence: 'high', name: '数字+元' },
  // P4: 末尾纯数字
  { pattern: /(\d+\.?\d*)\s*$/, confidence: 'medium', name: '末尾数字' },
  // P5: 兜底：第一个数字
  { pattern: /(\d+\.?\d*)/, confidence: 'low', name: '任意数字' },
]

export function extractAmount(text: string): AmountResult {
  for (const { pattern, confidence, group } of PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const amount = parseFloat(match[1])
      if (!isNaN(amount) && amount > 0) {
        return {
          amount,
          confidence,
          matchedText: match[group ?? 0] ?? match[0],
        }
      }
    }
  }

  return { amount: null, confidence: 'low', matchedText: '' }
}
