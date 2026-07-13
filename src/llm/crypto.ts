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
  try {
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
  } catch {
    // 降级：Base64 编码
    return btoa(plainKey)
  }
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
    // 降级：尝试 Base64 解码
    try {
      return atob(encryptedKey)
    } catch {
      return ''
    }
  }
}
