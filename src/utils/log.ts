// 轻量结构化日志:统一前缀,便于浏览器控制台过滤。
// 未来(P2+ 成本可观测/遥测)可在这一层接远端上报,调用方无需改动。

const PREFIX = '[MoneyNote]'

export function warn(msg: string, ...args: unknown[]): void {
  console.warn(PREFIX, msg, ...args)
}

export function error(msg: string, ...args: unknown[]): void {
  console.error(PREFIX, msg, ...args)
}
