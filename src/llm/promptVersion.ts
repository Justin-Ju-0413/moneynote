// ── Prompt 版本化（P1-3）──
// 各任务的 system prompt 独立版本：改动对应 prompt 时 bump 该值 → 旧缓存自动失效。
// 已接入：classificationCache（batch）/ auditCache（audit）；parse/chat/mapping 暂未接缓存。
export const PROMPT_VERSIONS = {
  parse: 1,
  batch: 1,
  audit: 1,
  chat: 1,
  mapping: 1,
} as const

/** 给缓存键附加版本后缀（版本 bump → 键变化 → 旧条目自然失效） */
export function versionedKey(key: string, version: number): string {
  return `${key}::v${version}`
}

/** 按任务取当前 prompt 版本生成缓存键 */
export function promptVersionKey(key: string, task: keyof typeof PROMPT_VERSIONS): string {
  return versionedKey(key, PROMPT_VERSIONS[task])
}
