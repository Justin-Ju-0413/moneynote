// 全角数字转半角
const FULL_TO_HALF: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  '．': '.', '。': '.', '，': ',', '：': ':',
}

// 中文货币单位映射
const UNIT_MAP: Record<string, string> = {
  '块': '元',
  '毛': '角',
  '大洋': '元',
  '人民币': '元',
  '块钱': '元',
}

export function normalize(text: string): string {
  let result = text

  // 全角数字/标点转半角
  result = result.replace(/[０-９．。，：]/g, (char) => FULL_TO_HALF[char] || char)

  // 中文货币单位替换
  for (const [key, value] of Object.entries(UNIT_MAP)) {
    result = result.replace(new RegExp(key, 'g'), value)
  }

  // 统一小写（英文）
  result = result.toLowerCase()

  // 压缩多余空白
  result = result.replace(/\s+/g, ' ').trim()

  return result
}
