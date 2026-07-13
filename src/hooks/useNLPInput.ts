import { useState, useCallback, useRef, useEffect } from 'react'
import { parseInput, needsLLMEnhancement, mergeLLMResult } from '@/nlp'
import { lookupParseCache, writeParseCache } from '@/nlp/parseCacheService'
import { callLLM } from '@/llm/service'
import { decryptApiKey } from '@/llm/crypto'
import { db } from '@/db'
import type { ParsedTransaction } from '@/db/types'
import type { LLMConfig, LLMStatus } from '@/llm/types'

export function useNLPInput() {
  const [inputValue, setInputValue] = useState('')
  const [parsedResult, setParsedResult] = useState<ParsedTransaction | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [llmStatus, setLlmStatus] = useState<LLMStatus>('idle')
  const [llmError, setLlmError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const llmAbortRef = useRef<AbortController | null>(null)

  // 缓存 LLM 配置
  const llmConfigRef = useRef<LLMConfig | null>(null)
  const llmLoadedRef = useRef(false)

  // 加载 LLM 配置
  useEffect(() => {
    const loadLLMConfig = async () => {
      try {
        const settings = await db.settings.toArray()
        const map = new Map(settings.map(s => [s.key, s.value]))
        const enabled = map.get('llm.enabled') === true
        if (enabled) {
          const endpoint = (map.get('llm.endpoint') as string) || ''
          const encryptedKey = (map.get('llm.apiKey') as string) || ''
          const model = (map.get('llm.model') as string) || ''
          const apiKey = encryptedKey ? await decryptApiKey(encryptedKey) : ''
          llmConfigRef.current = {
            enabled, endpoint, apiKey, model,
            maxTokens: (map.get('llm.maxTokens') as number) || 300,
            temperature: (map.get('llm.temperature') as number) ?? 0.1,
            timeout: (map.get('llm.timeout') as number) || 8000,
          }
        } else {
          llmConfigRef.current = null
        }
      } catch {
        llmConfigRef.current = null
      }
      llmLoadedRef.current = true
    }
    loadLLMConfig()
  }, [])

  const handleChange = useCallback((value: string) => {
    setInputValue(value)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // 取消进行中的 LLM 请求
    if (llmAbortRef.current) {
      llmAbortRef.current.abort()
      llmAbortRef.current = null
    }

    if (!value.trim()) {
      setParsedResult(null)
      setIsParsing(false)
      setLlmStatus('idle')
      setLlmError(null)
      return
    }

    setIsParsing(true)
    setLlmStatus('idle')
    setLlmError(null)

    debounceRef.current = setTimeout(async () => {
      // 规则解析（同步）
      const ruleResult = parseInput(value)
      setParsedResult(ruleResult)
      setIsParsing(false)

      // 检查是否需要 LLM 增强
      if (needsLLMEnhancement(ruleResult) && llmConfigRef.current?.enabled) {
        // 先查解析缓存，命中则跳过 API 调用
        const cachedResult = await lookupParseCache(value)
        if (cachedResult) {
          const merged = mergeLLMResult(ruleResult, cachedResult)
          setParsedResult(merged)
          setLlmStatus('success')
          return
        }

        setLlmStatus('loading')
        llmAbortRef.current = new AbortController()

        const { result, error } = await callLLM(llmConfigRef.current, value)

        if (llmAbortRef.current?.signal.aborted) return

        if (result) {
          // AI 解析成功，写入缓存
          await writeParseCache(value, result)

          const merged = mergeLLMResult(ruleResult, result)
          setParsedResult(merged)
          setLlmStatus('success')
          setLlmError(null)
        } else {
          setLlmStatus('error')
          setLlmError(error || null)
          // 严重错误（如 Key 无效）提示用户，网络/超时静默
          if (error && !['timeout', 'network', 'empty', 'parse'].includes(error)) {
            // 通过 llmError 传递给 UI
          }
        }

        llmAbortRef.current = null
      }
    }, 300)
  }, [])

  const clearInput = useCallback(() => {
    setInputValue('')
    setParsedResult(null)
    setIsParsing(false)
    setLlmStatus('idle')
    setLlmError(null)
    if (llmAbortRef.current) {
      llmAbortRef.current.abort()
      llmAbortRef.current = null
    }
  }, [])

  const updateParsedResult = useCallback((updates: Partial<ParsedTransaction>) => {
    setParsedResult((prev) => (prev ? { ...prev, ...updates } : null))
  }, [])

  return {
    inputValue,
    parsedResult,
    isParsing,
    llmStatus,
    llmError,
    handleChange,
    clearInput,
    updateParsedResult,
  }
}
