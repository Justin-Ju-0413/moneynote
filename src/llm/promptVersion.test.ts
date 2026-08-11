import { describe, it, expect } from 'vitest'
import { PROMPT_VERSIONS, promptVersionKey, versionedKey } from './promptVersion'

describe('promptVersionKey', () => {
  it('按任务生成带版本的缓存键', () => {
    expect(promptVersionKey('星巴克', 'batch')).toBe(`星巴克::v${PROMPT_VERSIONS.batch}`)
    expect(promptVersionKey('审计', 'audit')).toBe(`审计::v${PROMPT_VERSIONS.audit}`)
  })

  it('与 versionedKey 语义一致（当前各任务版本均为 1）', () => {
    expect(promptVersionKey('x', 'batch')).toBe(versionedKey('x', PROMPT_VERSIONS.batch))
    expect(promptVersionKey('x', 'audit')).toBe(versionedKey('x', PROMPT_VERSIONS.audit))
  })
})

describe('versionedKey（版本 bump 失效语义）', () => {
  it('版本变化 → 键变化（旧缓存条目自然失效）', () => {
    expect(versionedKey('星巴克', 1)).not.toBe(versionedKey('星巴克', 2))
  })

  it('同版本同 key → 稳定命中', () => {
    expect(versionedKey('星巴克', 1)).toBe(versionedKey('星巴克', 1))
  })
})
