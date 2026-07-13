import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { encryptApiKey, decryptApiKey } from '@/llm/crypto'
import { testLLMConnection } from '@/llm/service'
import type { LLMConfig } from '@/llm/types'

export function useLLMSettings() {
  const settings = useLiveQuery(() => db.settings.toArray())
  const [config, setConfig] = useState<LLMConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 从 IndexedDB 读取并解密
  useEffect(() => {
    if (!settings) return
    const map = new Map(settings.map(s => [s.key, s.value]))

    const loadConfig = async () => {
      const enabled = map.get('llm.enabled') === true
      const endpoint = (map.get('llm.endpoint') as string) || ''
      const encryptedKey = (map.get('llm.apiKey') as string) || ''
      const model = (map.get('llm.model') as string) || ''
      const maxTokens = (map.get('llm.maxTokens') as number) || 300
      const temperature = (map.get('llm.temperature') as number) ?? 0.1
      const timeout = (map.get('llm.timeout') as number) || 8000

      const apiKey = encryptedKey ? await decryptApiKey(encryptedKey) : ''

      setConfig({ enabled, endpoint, apiKey, model, maxTokens, temperature, timeout })
      setIsLoading(false)
    }

    loadConfig()
  }, [settings])

  // 保存配置
  const saveConfig = useCallback(async (updates: Partial<LLMConfig>) => {
    const current = config || {
      enabled: false, endpoint: '', apiKey: '', model: '',
      maxTokens: 300, temperature: 0.1, timeout: 8000,
    }

    const newConfig = { ...current, ...updates }

    // 如果有新的 API Key，加密后存储
    if (updates.apiKey !== undefined) {
      const encrypted = await encryptApiKey(updates.apiKey)
      await db.settings.put({ key: 'llm.apiKey', value: encrypted })
    }

    // 保存其他字段
    if (updates.enabled !== undefined) await db.settings.put({ key: 'llm.enabled', value: updates.enabled })
    if (updates.endpoint !== undefined) await db.settings.put({ key: 'llm.endpoint', value: updates.endpoint })
    if (updates.model !== undefined) await db.settings.put({ key: 'llm.model', value: updates.model })
    if (updates.maxTokens !== undefined) await db.settings.put({ key: 'llm.maxTokens', value: updates.maxTokens })
    if (updates.temperature !== undefined) await db.settings.put({ key: 'llm.temperature', value: updates.temperature })
    if (updates.timeout !== undefined) await db.settings.put({ key: 'llm.timeout', value: updates.timeout })

    setConfig(newConfig)
  }, [config])

  // 测试连接
  const testConnection = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    if (!config) return { success: false, message: '配置未加载' }
    return testLLMConnection(config)
  }, [config])

  // 清除配置
  const clearConfig = useCallback(async () => {
    await db.settings.put({ key: 'llm.enabled', value: false })
    await db.settings.put({ key: 'llm.apiKey', value: '' })
    await db.settings.put({ key: 'llm.endpoint', value: '' })
    await db.settings.put({ key: 'llm.model', value: '' })
  }, [])

  return { config, isLoading, saveConfig, testConnection, clearConfig }
}
