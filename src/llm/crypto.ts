const PASSPHRASE = 'moneynote-llm-key-protection-v1'
const SALT_KEY = 'moneynote_device_salt'
const ITERATIONS = 100000

// 获取或生成设备盐值（存储在 localStorage）
function getDeviceSalt(): string {
  let salt = localStorage.getItem(SALT_KEY)
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16))
      .toString()
    localStorage.setItem(SALT_KEY, salt)
  }
  return salt
}

// 派生 AES-GCM 256 位密钥
async function getDerivedKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const salt = getDeviceSalt()

  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(PASSPHRASE),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// 加密 API Key → Base64 字符串
export async function encryptApiKey(plainKey: string): Promise<string> {
  if (!plainKey) return ''
  // AES-GCM 加密。失败时直接抛错--绝不降级为 Base64(那等于明文存储 API Key)。
  // crypto.subtle 在安全上下文(https / localhost)可用;Vite dev 与 PWA 生产均满足。
  const encoder = new TextEncoder()
  const key = await getDerivedKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainKey)
  )
  // 将 IV + 密文拼接后 Base64 编码
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

// 解密 API Key
export async function decryptApiKey(encryptedKey: string): Promise<string> {
  if (!encryptedKey) return ''
  try {
    const combined = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)
    const key = await getDerivedKey()
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    // 兼容历史降级数据:旧版本加密失败时会以裸 Base64 存储,此处尝试解码。
    // 新数据均为 AES-GCM,此分支仅用于读取遗留明文 Base64 key;用户下次保存时重新加密(渐进迁移)
    try {
      return atob(encryptedKey)
    } catch {
      return ''
    }
  }
}
