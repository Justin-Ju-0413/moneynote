import { describe, it, expect, beforeEach, vi } from 'vitest'
import { encryptApiKey, decryptApiKey } from './crypto'

// crypto.ts 依赖 localStorage 存设备盐;node 测试环境无 localStorage,需 mock
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
})

describe('encryptApiKey / decryptApiKey', () => {
  beforeEach(() => store.clear())

  it('encrypt -> decrypt 往返还原原文', async () => {
    const plain = 'sk-test-12345'
    const enc = await encryptApiKey(plain)
    expect(await decryptApiKey(enc)).toBe(plain)
  })

  it('加密结果不是明文的 Base64(确为密文)', async () => {
    const plain = 'sk-test'
    const enc = await encryptApiKey(plain)
    expect(enc).not.toBe(plain)
    expect(enc).not.toBe(btoa(plain))
  })

  it('空字符串直返', async () => {
    expect(await encryptApiKey('')).toBe('')
    expect(await decryptApiKey('')).toBe('')
  })

  it('decrypt 能读历史 Base64 降级数据(向后兼容)', async () => {
    // 旧版本加密失败时会以裸 Base64 存储,decrypt 需兼容读取
    const plain = 'sk-legacy-key'
    const legacyBase64 = btoa(plain)
    expect(await decryptApiKey(legacyBase64)).toBe(plain)
  })

  it('加密失败时抛错,不降级为 Base64 明文', async () => {
    const spy = vi.spyOn(crypto.subtle, 'encrypt').mockRejectedValue(new Error('subtle unavailable'))
    await expect(encryptApiKey('sk-x')).rejects.toThrow()
    spy.mockRestore()
  })

  it('同一明文每次加密结果不同(随机 IV)', async () => {
    const plain = 'sk-same'
    const a = await encryptApiKey(plain)
    const b = await encryptApiKey(plain)
    expect(a).not.toBe(b)
    expect(await decryptApiKey(a)).toBe(plain)
    expect(await decryptApiKey(b)).toBe(plain)
  })
})
