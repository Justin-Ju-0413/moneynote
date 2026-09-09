import { useState, useMemo } from 'react'
import { useLLMSettings } from './useLLMSettings'
import { LLM_PRESETS } from '@/llm/types'
import type { LLMConfig } from '@/llm/types'

export interface LLMFormState {
  enabled: boolean
  endpoint: string
  model: string
  apiKey: string
}

/**
 * 设置页 LLM 表单的状态与动作。
 * 表单为本地草稿（避免频繁写 IndexedDB），保存/测试时才落库；
 * config 异步加载完成后在 render 期初始化一次（避免 effect 级联渲染）。
 */
export function useLLMForm() {
  const { config, isLoading, saveConfig, testConnection } = useLLMSettings()
  const [form, setForm] = useState<LLMFormState>({ enabled: false, endpoint: '', model: '', apiKey: '' })
  const [initialized, setInitialized] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)

  if (config && !initialized) {
    setForm({ enabled: config.enabled, endpoint: config.endpoint, model: config.model, apiKey: config.apiKey })
    setInitialized(true)
  }

  const patchForm = (patch: Partial<LLMFormState>) => setForm((f) => ({ ...f, ...patch }))

  // 当前选中的服务商与其可用模型
  const currentPreset = useMemo(
    () => LLM_PRESETS.find((p) => p.endpoint === form.endpoint && p.endpoint) || null,
    [form.endpoint],
  )
  const availableModels = currentPreset?.models || []
  const isCustomModel = availableModels.length > 0 && !availableModels.includes(form.model)

  const selectPreset = (presetName: string) => {
    const preset = LLM_PRESETS.find((p) => p.name === presetName)
    if (preset) {
      setForm((f) => ({
        ...f,
        endpoint: preset.endpoint,
        model: preset.models.length > 0 ? preset.models[0] : f.model,
      }))
    }
  }

  const save = async () => {
    setIsSaving(true)
    try {
      await saveConfig(form)
      return true
    } catch {
      return false
    }
    finally {
      setIsSaving(false)
    }
  }

  const test = async (): Promise<{ success: boolean; message: string } | null> => {
    setIsTesting(true)
    setTestSuccess(false)
    try {
      await saveConfig(form)
      const result = await testConnection()
      if (result.success) {
        setTestSuccess(true)
        setTimeout(() => setTestSuccess(false), 2000)
      }
      return result
    } catch {
      return null
    }
    finally {
      setIsTesting(false)
    }
  }

  // 导入流程注入解析/分类的草稿配置（与表单一致，未保存也可用；超参沿用导入场景的固定值）
  const draftLLMConfig: LLMConfig | undefined =
    form.enabled && !!form.endpoint && !!form.apiKey && !!form.model
      ? {
          enabled: true, endpoint: form.endpoint, model: form.model, apiKey: form.apiKey,
          maxTokens: 512, temperature: 0.1, timeout: 15000,
          privacyMode: config?.privacyMode ?? true, batchSize: config?.batchSize ?? 30,
        }
      : undefined

  return {
    form,
    patchForm,
    isLoading,
    isSaving,
    isTesting,
    testSuccess,
    currentPreset,
    availableModels,
    isCustomModel,
    selectPreset,
    save,
    test,
    draftLLMConfig,
  }
}

export type LLMForm = ReturnType<typeof useLLMForm>
