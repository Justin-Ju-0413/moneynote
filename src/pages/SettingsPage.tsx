import { useState, useRef, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import { useLLMSettings } from '@/hooks/useLLMSettings'
import { useBillTemplateLearning } from '@/hooks/useBillTemplateLearning'
import { ColumnMappingDialog } from '@/components/input/ColumnMappingDialog'
import { TemplateDetailDialog } from '@/components/input/TemplateDetailDialog'
import { LLM_PRESETS } from '@/llm/types'
import { db, bulkImportTransactions } from '@/db'
import type { BillTemplate, ColumnMapping, BackupRecord } from '@/db/types'
import { exportToCSV, exportToJSON, downloadFile } from '@/utils/export'
import { parseBillFile, SOURCE_LABELS } from '@/utils/import'
import type { ParseResult } from '@/utils/import'
import { classifyBillRows } from '@/utils/billClassifier'
import type { ClassifyResult } from '@/utils/billClassifier'
import { CATEGORY_MAP } from '@/utils/constants'
import { getAllTemplates, deleteTemplate } from '@/bill-analyzer/templateMatcher'
import { createBackup, listBackups, restoreBackup, deleteBackup, setAutoBackupEnabled } from '@/utils/backup'

interface ImportResultDetail {
  sourceName: string
  imported: number
  skipped: number
  filtered: number
  classifyResult: ClassifyResult
}

export function SettingsPage() {
  const { showToast } = useToast()
  const { config, isLoading, saveConfig, testConnection } = useLLMSettings()
  const learning = useBillTemplateLearning()
  const [showApiKey, setShowApiKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [importResult, setImportResult] = useState<ImportResultDetail | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<BillTemplate | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resolveCallbackRef = useRef<((template: BillTemplate | null) => void) | null>(null)

  // 本地表单状态（避免频繁写 IndexedDB）
  const [formEndpoint, setFormEndpoint] = useState('')
  const [formModel, setFormModel] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formEnabled, setFormEnabled] = useState(false)
  const [formInitialized, setFormInitialized] = useState(false)

  // config 加载后初始化表单
  useEffect(() => {
    if (config && !formInitialized) {
      setFormEndpoint(config.endpoint)
      setFormModel(config.model)
      setFormApiKey(config.apiKey)
      setFormEnabled(config.enabled)
      setFormInitialized(true)
    }
  }, [config, formInitialized])

  const transactions = useLiveQuery(() => db.transactions.toArray()) || []
  const transactionCount = transactions.length
  const cacheCount = useLiveQuery(() => db.classificationCache.count()) ?? 0
  const parseCacheCount = useLiveQuery(() => db.parseCache.count()) ?? 0
  const templates = useLiveQuery(() => getAllTemplates()) ?? []
  const templateCount = templates.length

  // 数据备份
  const backups = (useLiveQuery(() => listBackups()) ?? []) as BackupRecord[]
  const autoBackupOn = useLiveQuery(() => db.settings.get('backup.auto'))?.value !== false
  const [backupBusy, setBackupBusy] = useState(false)

  const handleBackupNow = async () => {
    setBackupBusy(true)
    try {
      await createBackup('manual')
      showToast('已创建备份', 'success')
    } catch {
      showToast('备份失败', 'error')
    }
    setBackupBusy(false)
  }

  const handleToggleAuto = async () => {
    const next = !autoBackupOn
    await db.settings.put({ key: 'backup.auto', value: next })
    setAutoBackupEnabled(next)
    showToast(next ? '已开启自动备份' : '已关闭自动备份', 'info')
  }

  const handleRestore = async (b: BackupRecord) => {
    if (!confirm(`确认恢复到 ${new Date(b.createdAt).toLocaleString()} 的备份？当前数据将被覆盖。`)) return
    try {
      await restoreBackup(b.id as number)
      showToast('已恢复，刷新页面以生效', 'success')
    } catch {
      showToast('恢复失败', 'error')
    }
  }

  const handleDeleteBackup = async (id: number) => {
    await deleteBackup(id)
    showToast('已删除备份')
  }

  // 当前选中的服务商
  const currentPreset = useMemo(() => {
    return LLM_PRESETS.find(p => p.endpoint === formEndpoint && p.endpoint) || null
  }, [formEndpoint])

  // 当前服务商可用模型
  const availableModels = currentPreset?.models || []
  const isCustomModel = availableModels.length > 0 && !availableModels.includes(formModel)

  const handleSelectPreset = (presetName: string) => {
    const preset = LLM_PRESETS.find(p => p.name === presetName)
    if (preset) {
      setFormEndpoint(preset.endpoint)
      if (preset.models.length > 0) {
        setFormModel(preset.models[0])
      }
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await saveConfig({
        enabled: formEnabled,
        endpoint: formEndpoint,
        model: formModel,
        apiKey: formApiKey,
      })
      showToast('配置已保存')
    } catch {
      showToast('保存失败', 'error')
    }
    setIsSaving(false)
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestSuccess(false)
    await saveConfig({
      enabled: formEnabled,
      endpoint: formEndpoint,
      model: formModel,
      apiKey: formApiKey,
    })
    const result = await testConnection()
    showToast(result.message, result.success ? 'success' : 'error')
    if (result.success) {
      setTestSuccess(true)
      setTimeout(() => setTestSuccess(false), 2000)
    }
    setIsTesting(false)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setIsImporting(true)
    setImportProgress('解析文件...')
    try {
      const llmEnabled = formEnabled && !!formEndpoint && !!formApiKey && !!formModel
      const llmConfig = llmEnabled ? {
        enabled: true, endpoint: formEndpoint, model: formModel, apiKey: formApiKey,
        maxTokens: 512, temperature: 0.1, timeout: 15000,
      } : undefined

      // 1. 解析文件（含模板匹配 + 学习流程）
      const parseResult: ParseResult = await parseBillFile(file, {
        llmConfig,
        onLearnRequest: async (ctx) => {
          learning.startLearning(file, ctx)
          return new Promise<BillTemplate | null>((resolve) => {
            resolveCallbackRef.current = resolve
          })
        },
      })

      if (parseResult.rows.length === 0) {
        showToast('文件中没有可导入的记录', 'info')
        setIsImporting(false)
        setImportProgress('')
        return
      }

      // 查找匹配的模板
      let matchedTemplate: BillTemplate | undefined
      if (parseResult.templateId) {
        matchedTemplate = templates.find(t => t.id === parseResult.templateId)
      }

      // 2. 分类映射
      setImportProgress(`本地分类中 (0/${parseResult.rows.length})`)
      const classifyResult = await classifyBillRows(parseResult.rows, {
        llmEnabled,
        llmConfig,
        template: matchedTemplate,
        onProgress: (p) => {
          const label = p.phase === 'llm_batch' ? 'AI 批量分类中' : '本地分类中'
          setImportProgress(`${label} (${p.current}/${p.total})`)
        },
      })

      if (classifyResult.transactions.length === 0) {
        showToast('所有记录均被过滤，无可导入数据', 'info')
        setIsImporting(false)
        setImportProgress('')
        return
      }

      // 3. 批量导入（去重）
      setImportProgress('写入数据库...')
      const importResult = await bulkImportTransactions(classifyResult.transactions)

      // 4. 结果反馈
      const sourceName = SOURCE_LABELS[parseResult.source] || parseResult.source
      showToast(`${sourceName} 导入完成，新增 ${importResult.imported} 笔`, 'success')

      setImportResult({
        sourceName,
        imported: importResult.imported,
        skipped: importResult.skipped,
        filtered: classifyResult.skippedCount,
        classifyResult,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导入失败'
      showToast(msg, 'error')
    }
    setIsImporting(false)
    setImportProgress('')
  }

  // 学习回调：用户在 ColumnMappingDialog 中确认
  const handleLearningConfirm = async (name: string, mappings: ColumnMapping[]) => {
    const template = await learning.confirm(name, mappings)
    if (template && resolveCallbackRef.current) {
      resolveCallbackRef.current(template)
      resolveCallbackRef.current = null
    }
    learning.reset()
  }

  const handleLearningCancel = () => {
    if (resolveCallbackRef.current) {
      resolveCallbackRef.current(null)
      resolveCallbackRef.current = null
    }
    learning.cancel()
  }

  const handleDeleteTemplate = async (id: number) => {
    try {
      await deleteTemplate(id)
      showToast('模板已删除')
      setSelectedTemplate(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error')
    }
  }

  const handleExportCSV = () => {
    if (transactionCount === 0) {
      showToast('暂无数据可导出', 'info')
      return
    }
    const csv = exportToCSV(transactions)
    downloadFile(csv, `moneynote_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8')
    showToast('CSV 导出成功')
  }

  const handleExportJSON = () => {
    if (transactionCount === 0) {
      showToast('暂无数据可导出', 'info')
      return
    }
    const json = exportToJSON(transactions)
    downloadFile(json, `moneynote_${new Date().toISOString().split('T')[0]}.json`, 'application/json')
    showToast('JSON 导出成功')
  }

  const handleClearData = async () => {
    if (!confirm('确定要清除所有数据吗？此操作不可恢复！')) return
    await db.transactions.clear()
    await db.budgets.clear()
    await db.classificationCache.clear()
    await db.parseCache.clear()
    showToast('数据已清除')
  }

  const handleClearCache = async () => {
    if (!confirm('确定要清除 AI 缓存吗？下次输入/导入将重新调用 AI。')) return
    await db.classificationCache.clear()
    await db.parseCache.clear()
    showToast('AI 缓存已清除')
  }

  // 计算分类分布（用于导入结果详情）
  const getCategoryDistribution = (result: ImportResultDetail) => {
    const dist: Record<string, number> = {}
    for (const tx of result.classifyResult.transactions) {
      dist[tx.category] = (dist[tx.category] || 0) + 1
    }
    return Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({
        id: cat,
        name: CATEGORY_MAP[cat]?.name || cat,
        icon: CATEGORY_MAP[cat]?.icon || '📦',
        count,
        pct: Math.round(count / result.classifyResult.transactions.length * 100),
      }))
  }

  const settingItems = [
    { title: '导入账单', desc: '支持支付宝 CSV、微信/平安银行 Excel 等账单文件', action: handleImportClick, disabled: isImporting },
    { title: '导出 CSV', desc: '导出为 Excel 可打开的表格文件', action: handleExportCSV },
    { title: '导出 JSON', desc: '导出为备份文件，可用于恢复', action: handleExportJSON },
    { title: '清除 AI 缓存', desc: `分类缓存 ${cacheCount} 条 + 解析缓存 ${parseCacheCount} 条`, action: handleClearCache },
    { title: '清除所有数据', desc: '删除所有交易记录、预算和缓存', action: handleClearData, danger: true },
  ]

  return (
    <div>
      <PageHeader title="设置" subtitle="个性化你的应用" />
      <div className="px-5 space-y-5 md:px-8 md:space-y-6 lg:px-10 lg:space-y-8">
        {/* 隐藏的文件选择器 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleFileSelected}
        />

        {/* 数据统计 */}
        <Card>
          <div className="flex flex-col md:flex-row md:items-center md:gap-8 space-y-2 md:space-y-0">
            <div className="flex items-center justify-between md:flex-1">
              <span className="text-xs text-text-secondary">交易记录数</span>
              <span className="text-xs font-heading text-text">{transactionCount} 笔</span>
            </div>
            <div className="flex items-center justify-between md:flex-1">
              <span className="text-xs text-text-secondary">AI 分类缓存</span>
              <span className="text-xs font-heading text-text">{cacheCount} 条</span>
            </div>
            <div className="flex items-center justify-between md:flex-1">
              <span className="text-xs text-text-secondary">AI 解析缓存</span>
              <span className="text-xs font-heading text-text">{parseCacheCount} 条</span>
            </div>
          </div>
        </Card>

        {/* 账单模板管理 */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">账单模板</h3>
              <p className="text-[10px] text-text-muted mt-1">已学习 {templateCount} 种格式，自动识别导入文件</p>
            </div>
          </div>
          {templates.length > 0 ? (
            <div className="space-y-1.5">
              {templates.map(tmpl => (
                <div
                  key={tmpl.id || tmpl.fingerprint}
                  className="flex items-center justify-between px-3 py-2 border border-primary-200/30 hover:bg-primary-50/20 cursor-pointer transition-colors"
                  onClick={() => setSelectedTemplate(tmpl)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${tmpl.isBuiltIn ? 'bg-primary-500' : 'bg-green-500'}`} />
                    <span className="text-xs text-text">{tmpl.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-text-muted">{tmpl.importCount} 次</span>
                    <span className="text-text-placeholder text-sm">›</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-text-placeholder">导入新格式账单时将自动学习</p>
          )}
        </Card>

        {/* AI 智能解析 */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">AI 智能解析</h3>
              <p className="text-[10px] text-text-muted mt-1">低置信度时使用大模型增强解析</p>
            </div>
            <button
              className={`w-10 h-5 rounded-full transition-colors relative ${formEnabled ? 'bg-primary-600' : 'bg-primary-200/50'}`}
              onClick={() => setFormEnabled(!formEnabled)}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-bg rounded-full transition-transform ${formEnabled ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </div>

          {formEnabled && (
            <div className={`space-y-4 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
              {/* 服务商快捷选择 */}
              <div>
                <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2 block">服务商</label>
                <div className="flex gap-1.5 flex-wrap">
                  {LLM_PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      className={`px-3 py-1.5 text-[10px] tracking-widest uppercase font-medium transition-colors ${
                        formEndpoint === preset.endpoint && preset.endpoint
                          ? 'bg-primary-600 text-bg'
                          : 'border border-primary-300/50 text-text-muted hover:text-primary-600'
                      }`}
                      onClick={() => handleSelectPreset(preset.name)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* API 地址 */}
              <div>
                <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5 block">API 地址</label>
                <input
                  type="text"
                  value={formEndpoint}
                  onChange={(e) => setFormEndpoint(e.target.value)}
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
                    value={formApiKey}
                    onChange={(e) => setFormApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="flex-1 px-3 py-2 text-xs outline-none bg-transparent text-text placeholder:text-text-placeholder"
                  />
                  <button
                    className="px-3 text-[10px] tracking-widest uppercase text-text-muted hover:text-primary-600"
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
                        <button
                          key={model}
                          className={`px-3 py-1.5 text-[10px] tracking-wider font-medium transition-colors ${
                            formModel === model
                              ? 'bg-primary-600 text-bg'
                              : 'border border-primary-300/50 text-text-muted hover:text-primary-600'
                          }`}
                          onClick={() => setFormModel(model)}
                        >
                          {model}
                        </button>
                      ))}
                      <button
                        className={`px-3 py-1.5 text-[10px] tracking-wider font-medium transition-colors ${
                          isCustomModel
                            ? 'bg-primary-600 text-bg'
                            : 'border border-primary-300/50 text-text-muted hover:text-primary-600'
                        }`}
                        onClick={() => setFormModel('')}
                      >
                        自定义
                      </button>
                    </div>
                    {isCustomModel && (
                      <input
                        type="text"
                        value={formModel}
                        onChange={(e) => setFormModel(e.target.value)}
                        placeholder="输入自定义模型名称"
                        className="w-full px-3 py-2 border border-primary-300/50 text-xs outline-none bg-transparent text-text placeholder:text-text-placeholder"
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
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
                  className={`flex-1 transition-colors ${testSuccess ? '!bg-green-600 !text-white' : ''}`}
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
        </Card>

        {/* 数据备份 */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">数据备份</h3>
              <p className="text-[10px] text-text-muted mt-1">自动快照防止数据意外丢失，保留最近 10 份自动备份</p>
            </div>
            <button
              className={`w-10 h-5 rounded-full transition-colors relative ${autoBackupOn ? 'bg-primary-600' : 'bg-primary-200/50'}`}
              onClick={handleToggleAuto}
              title="数据变更 60 秒后自动备份"
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-bg rounded-full transition-transform ${autoBackupOn ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <Button onClick={handleBackupNow} variant="secondary" className="flex-1" disabled={backupBusy}>
              {backupBusy ? '备份中...' : '立即备份'}
            </Button>
          </div>

          {backups.length > 0 ? (
            <div className="space-y-1.5">
              {backups.slice(0, 12).map((b) => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2 border border-primary-200/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full ${b.kind === 'auto' ? 'bg-primary-400' : 'bg-green-500'}`} />
                    <span className="text-[10px] text-text truncate">{new Date(b.createdAt).toLocaleString()}</span>
                    <span className="text-[9px] text-text-muted uppercase">{b.kind === 'auto' ? '自动' : '手动'}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button className="text-[10px] text-primary-600 hover:underline" onClick={() => handleRestore(b)}>恢复</button>
                    <button className="text-[10px] text-[#c94040] hover:underline" onClick={() => handleDeleteBackup(b.id as number)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-text-placeholder">暂无备份，点击「立即备份」创建第一份</p>
          )}
        </Card>

        {/* 设置项 */}
        <div className="space-y-0 border-t border-b border-primary-200/30">
          {settingItems.map((item, i) => (
            <div
              key={item.title}
              className={`cursor-pointer hover:bg-primary-50/20 px-4 py-4 md:px-5 md:py-5 transition-colors ${
                'disabled' in item && item.disabled ? 'opacity-50 pointer-events-none' : ''
              } ${i < settingItems.length - 1 ? 'border-b border-primary-200/30' : ''}`}
              onClick={item.action}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xs font-medium ${'danger' in item && item.danger ? 'text-[#c94040]' : 'text-text'}`}>{item.title}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">{'disabled' in item && item.disabled ? (importProgress || '导入中...') : item.desc}</p>
                </div>
                <span className="text-text-placeholder text-sm">›</span>
              </div>
            </div>
          ))}
        </div>

        {/* 关于 */}
        <Card>
          <div className="text-center py-3">
            <p className="font-heading text-lg text-primary-700 mb-1">MoneyNote</p>
            <p className="text-[10px] tracking-widest uppercase text-text-muted">AI 智能记账 · v1.0.0</p>
            <div className="h-px bg-primary-200/30 my-3" />
            <p className="text-[10px] text-text-placeholder">自然语言输入，轻松记一笔</p>
          </div>
        </Card>
      </div>

      {/* 导入结果详情 Dialog */}
      <Dialog open={!!importResult} onClose={() => setImportResult(null)} title="导入结果">
        {importResult && (() => {
          const cr = importResult.classifyResult
          const dist = getCategoryDistribution(importResult)
          return (
            <div className="space-y-5">
              {/* 基础统计 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-primary-200/50 p-3">
                  <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">来源</p>
                  <p className="text-sm font-heading text-text">{importResult.sourceName}</p>
                </div>
                <div className="border border-primary-200/50 p-3">
                  <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">新增</p>
                  <p className="text-sm font-heading text-primary-600">{importResult.imported} 笔</p>
                </div>
                <div className="border border-primary-200/50 p-3">
                  <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">跳过重复</p>
                  <p className="text-sm font-heading text-text">{importResult.skipped} 笔</p>
                </div>
                <div className="border border-primary-200/50 p-3">
                  <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">过滤无效</p>
                  <p className="text-sm font-heading text-text">{importResult.filtered} 笔</p>
                </div>
              </div>

              {/* AI 分类统计 */}
              {(cr.llmUsedCount > 0 || cr.cacheHitCount > 0 || cr.llmFailedCount > 0) && (
                <div>
                  <p className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium mb-3">AI 分类统计</p>
                  <div className="flex gap-4 text-xs">
                    {cr.llmUsedCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-primary-500 rounded-full" />
                        <span className="text-text-secondary">AI 分类</span>
                        <span className="font-heading text-text">{cr.llmUsedCount} 笔</span>
                      </div>
                    )}
                    {cr.cacheHitCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-text-secondary">缓存命中</span>
                        <span className="font-heading text-text">{cr.cacheHitCount} 笔</span>
                      </div>
                    )}
                    {cr.llmFailedCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-[#c94040] rounded-full" />
                        <span className="text-text-secondary">失败</span>
                        <span className="font-heading text-text">{cr.llmFailedCount} 笔</span>
                      </div>
                    )}
                  </div>
                  {cr.llmErrorDetail && (
                    <p className="text-[10px] text-[#c94040] mt-2">错误详情: {cr.llmErrorDetail}</p>
                  )}
                </div>
              )}

              {/* 分类分布 */}
              {dist.length > 0 && (
                <div>
                  <p className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium mb-3">分类分布</p>
                  <div className="space-y-2">
                    {dist.map(d => (
                      <div key={d.id} className="flex items-center gap-2">
                        <span className="text-sm w-5 text-center">{d.icon}</span>
                        <span className="text-xs text-text-secondary w-10">{d.name}</span>
                        <div className="flex-1 h-1.5 bg-primary-100/50 overflow-hidden">
                          <div
                            className="h-full bg-primary-500 transition-all"
                            style={{ width: `${d.pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-text-muted w-14 text-right">{d.count} ({d.pct}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={() => setImportResult(null)} className="w-full">关闭</Button>
            </div>
          )
        })()}
      </Dialog>

      {/* 列映射确认对话框 */}
      <ColumnMappingDialog
        open={learning.state.phase === 'confirming'}
        context={learning.state.phase === 'confirming' ? learning.state.context : null}
        onConfirm={handleLearningConfirm}
        onCancel={handleLearningCancel}
      />

      {/* 模板详情对话框 */}
      <TemplateDetailDialog
        open={!!selectedTemplate}
        template={selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        onDelete={handleDeleteTemplate}
      />
    </div>
  )
}
