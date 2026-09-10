import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/ui/toast-context'
import { LLM_PRESETS } from '@/llm/types'
import { LLMUsage } from '@/components/settings/LLMUsage'
import type { LLMForm } from '@/hooks/useLLMForm'

/** AI 智能解析设置卡：服务商/模型/Key 表单 + 连接测试。表单状态由 useLLMForm 提供 */
export function LLMSettingsCard({ llm }: { llm: LLMForm }) {
  const { showToast } = useToast()
  const [showApiKey, setShowApiKey] = useState(false)
  const { form, patchForm, isLoading, isSaving, isTesting, testSuccess, availableModels, isCustomModel } = llm

  const handleSave = async () => {
    const ok = await llm.save()
    showToast(ok ? '配置已保存' : '保存失败', ok ? undefined : 'error')
  }

  const handleTest = async () => {
    const result = await llm.test()
    if (result) {
      showToast(result.message, result.success ? 'success' : 'error')
    } else {
      showToast('保存失败', 'error')
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[10px] tracking-[0.15em] uppercase text-accent font-medium">AI 智能解析</h3>
          <p className="text-[10px] text-text-muted mt-1">低置信度时使用大模型增强解析</p>
        </div>
        <Toggle
          checked={form.enabled}
          onChange={() => patchForm({ enabled: !form.enabled })}
          label="AI 智能解析"
        />
      </div>

      {form.enabled && (
        <div className={`space-y-4 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* 服务商快捷选择 */}
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2 block">服务商</label>
            <div className="flex gap-1.5 flex-wrap">
              {LLM_PRESETS.map(preset => (
                <Chip
                  key={preset.name}
                  active={form.endpoint === preset.endpoint && !!preset.endpoint}
                  onClick={() => llm.selectPreset(preset.name)}
                >
                  {preset.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* API 地址 */}
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5 block">API 地址</label>
            <input
              type="text"
              value={form.endpoint}
              onChange={(e) => patchForm({ endpoint: e.target.value })}
              placeholder="https://api.example.com"
              className="w-full px-3 py-2 border border-primary-300/50 text-xs outline-none bg-transparent text-text placeholder:text-text-placeholder"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5 block">API Key</label>
            <div className="flex border border-primary-300/50">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => patchForm({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="flex-1 px-3 py-2 text-xs outline-none bg-transparent text-text placeholder:text-text-placeholder"
              />
              <button
                className="px-3 text-[10px] tracking-widest uppercase text-text-muted hover:text-accent"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          {/* 模型选择 */}
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5 block">模型</label>
            {availableModels.length > 0 ? (
              <div className="space-y-2">
                <div className="flex gap-1.5 flex-wrap">
                  {availableModels.map(model => (
                    <Chip key={model} active={form.model === model} onClick={() => patchForm({ model })}>
                      {model}
                    </Chip>
                  ))}
                  <Chip active={isCustomModel} onClick={() => patchForm({ model: '' })}>
                    自定义
                  </Chip>
                </div>
                {isCustomModel && (
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => patchForm({ model: e.target.value })}
                    placeholder="输入自定义模型名称"
                    className="w-full px-3 py-2 border border-primary-300/50 text-xs outline-none bg-transparent text-text placeholder:text-text-placeholder"
                  />
                )}
              </div>
            ) : (
              <input
                type="text"
                value={form.model}
                onChange={(e) => patchForm({ model: e.target.value })}
                placeholder="deepseek-v4-flash / gpt-4.1-nano"
                className="w-full px-3 py-2 border border-primary-300/50 text-xs outline-none bg-transparent text-text placeholder:text-text-placeholder"
              />
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleTest}
              variant="secondary"
              className={`flex-1 transition-colors ${testSuccess ? '!bg-success !text-white' : ''}`}
              disabled={isTesting}
            >
              {isTesting ? '测试中...' : testSuccess ? '✓ 连接成功' : '测试连接'}
            </Button>
            <Button onClick={handleSave} className="flex-1" disabled={isSaving}>
              {isSaving ? '保存中...' : '保存配置'}
            </Button>
          </div>

          <p className="text-[10px] text-text-placeholder leading-relaxed">
            API Key 仅存储在本地浏览器中，不会上传至任何服务器。
          </p>
        </div>
      )}

      {/* C3 成本可观测：本月 LLM 用量（本地记录） */}
      <LLMUsage />
    </Card>
  )
}
