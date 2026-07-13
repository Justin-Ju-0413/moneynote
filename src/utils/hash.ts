// 轻量字符串哈希（djb2 变体），用于生成审计缓存键
export function hashKey(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i)
  }
  return (h >>> 0).toString(36)
}
