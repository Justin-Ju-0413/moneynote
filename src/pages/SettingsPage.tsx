import { useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/toast-context'
import { useLLMForm } from '@/hooks/useLLMForm'
import { useBillImport } from '@/hooks/useBillImport'
import { ColumnMappingDialog } from '@/components/input/ColumnMappingDialog'
import { CategoryManager } from '@/components/settings/CategoryManager'
import { LearningRulesManager } from '@/components/settings/LearningRulesManager'
import { LLMSettingsCard } from '@/components/settings/LLMSettingsCard'
import { BackupCard } from '@/components/settings/BackupCard'
import { AppearanceCard } from '@/components/settings/AppearanceCard'
import { TemplateListCard } from '@/components/settings/TemplateListCard'
import { ImportResultDialog } from '@/components/settings/ImportResultDialog'
import { db } from '@/db'
import { getAllTransactions } from '@/db/repos/transactions'
import type { BillTemplate } from '@/db/types'
import { exportToCSV, exportToJSON, downloadFile } from '@/utils/export'
import { APP_VERSION } from '@/utils/constants'
import { getAllTemplates } from '@/bill-analyzer/templateMatcher'

interface ConfirmAction {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
}

interface SettingItem {
  title: string
  desc: string
  action: () => void | Promise<void>
  danger?: boolean
}

/** 设置分组：页内 tab 子导航，仅渲染当前组（卡片按需挂载） */
type SettingsGroup = 'ai' | 'data' | 'appearance' | 'danger'

const SETTINGS_GROUPS: { key: SettingsGroup; label: string }[] = [
  { key: 'ai', label: 'AI 智能' },
  { key: 'data', label: '数据' },
  { key: 'appearance', label: '外观' },
  { key: 'danger', label: '危险区' },
]

/** 设置项行：数据导入导出与危险区共用的点击行样式（卡片内使用，行间以细分隔线分隔） */
function SettingRow({ title, desc, danger, disabled, onClick }: {
  title: string
  desc: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <div
      className={`cursor-pointer hover:bg-primary-50/20 px-2 -mx-2 py-3.5 rounded-button transition-colors border-b border-primary-200/30 last:border-b-0 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-xs font-medium ${danger ? 'text-danger' : 'text-text'}`}>{title}</p>
          <p className="text-[11px] text-text-muted mt-0.5">{desc}</p>
        </div>
        <span className="text-text-placeholder text-sm">›</span>
      </div>
    </div>
  )
}

/** 分组分段器：胶囊风格（对齐统计页 PeriodSwitcher），桌面横排、移动端横向滚动 */
function GroupSwitcher({ group, onChange }: { group: SettingsGroup; onChange: (g: SettingsGroup) => void }) {
  return (
    <div
      role="tablist"
      aria-label="设置分组"
      className="flex w-fit max-w-full rounded-full border border-primary-300/50 bg-bg p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {SETTINGS_GROUPS.map((g) => {
        const active = group === g.key
        return (
          <button
            key={g.key}
            role="tab"
            id={`settings-tab-${g.key}`}
            aria-selected={active}
            aria-controls={`settings-panel-${g.key}`}
            className={`px-4 py-2 min-h-9 rounded-full text-xs font-medium transition-colors shrink-0 ${
              active
                ? g.key === 'danger'
                  ? 'bg-danger text-white shadow-sm'
                  : 'bg-primary-600 text-bg shadow-sm'
                : 'text-text-muted hover:text-accent'
            }`}
            onClick={() => onChange(g.key)}
          >
            {g.label}
          </button>
        )
      })}
    </div>
  )
}

export function SettingsPage() {
  const { showToast } = useToast()
  const llm = useLLMForm()
  const [group, setGroup] = useState<SettingsGroup>('ai')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const transactions = useLiveQuery(() => getAllTransactions()) || []
  const transactionCount = transactions.length
  const cacheCount = useLiveQuery(() => db.classificationCache.count()) ?? 0
  const parseCacheCount = useLiveQuery(() => db.parseCache.count()) ?? 0
  const templates = (useLiveQuery(() => getAllTemplates()) ?? []) as BillTemplate[]

  const billImport = useBillImport({ llmConfig: llm.draftLLMConfig, fileInputRef })

  const handleExportCSV = async () => {
    if (transactionCount === 0) {
      showToast('暂无数据可导出', 'info')
      return
    }
    const cats = await db.categories.toArray()
    const categoryMap = Object.fromEntries(cats.map((c) => [c.id, c.name]))
    const csv = exportToCSV(transactions, categoryMap)
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

  const handleClearData = () => {
    setConfirmAction({
      title: '清除所有数据',
      message: '确定要清除所有数据吗？此操作不可恢复！',
      confirmText: '清除',
      danger: true,
      onConfirm: async () => {
        await db.transactions.clear()
        await db.budgets.clear()
        await db.classificationCache.clear()
        await db.parseCache.clear()
        showToast('数据已清除')
      },
    })
  }

  const handleClearCache = () => {
    setConfirmAction({
      title: '清除 AI 缓存',
      message: '确定要清除 AI 缓存吗？下次输入/导入将重新调用 AI。',
      confirmText: '清除',
      onConfirm: async () => {
        await db.classificationCache.clear()
        await db.parseCache.clear()
        showToast('AI 缓存已清除')
      },
    })
  }

  const exportItems: SettingItem[] = [
    { title: '导出 CSV', desc: '导出为 Excel 可打开的表格文件', action: handleExportCSV },
    { title: '导出 JSON', desc: '导出为备份文件，可用于恢复', action: handleExportJSON },
  ]

  const dangerItems: SettingItem[] = [
    {
      title: '清除 AI 缓存',
      desc: `分类缓存 ${cacheCount} 条 + 解析缓存 ${parseCacheCount} 条，清除后下次输入/导入将重新调用 AI`,
      action: handleClearCache,
      danger: true,
    },
    {
      title: '清除所有数据',
      desc: '删除所有交易记录、预算和缓存，操作后不可恢复，建议先备份',
      action: handleClearData,
      danger: true,
    },
  ]

  return (
    <div>
      <PageHeader title="设置" subtitle="个性化你的应用" />
      <div className="px-5 space-y-5 md:px-8 lg:px-10">
        {/* 隐藏的文件选择器：ref 由页面持有直接挂载（不进组），触发走 billImport.openFilePicker */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={billImport.onFileSelected}
        />

        {/* 关于（常驻，不进组）：版本 + 一句话简介 */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-heading text-sm text-heading">MoneyNote</span>
              <span className="text-[11px] text-text-muted shrink-0">v{APP_VERSION}</span>
            </div>
            <p className="text-[11px] text-text-placeholder truncate">本地优先的 AI 记账 · 自然语言输入，轻松记一笔</p>
          </div>
        </Card>

        {/* 分组分段器 */}
        <GroupSwitcher group={group} onChange={setGroup} />

        {/* AI 智能：LLM 配置/用量 + 账单模板 + 学习规则 */}
        {group === 'ai' && (
          <div id="settings-panel-ai" role="tabpanel" aria-labelledby="settings-tab-ai" className="space-y-5">
            <LLMSettingsCard llm={llm} />
            <TemplateListCard templates={templates} />
            <LearningRulesManager />
          </div>
        )}

        {/* 数据：数据概览 + 分类管理 + 导入导出 + 备份 */}
        {group === 'data' && (
          <div id="settings-panel-data" role="tabpanel" aria-labelledby="settings-tab-data" className="space-y-5">
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

            {/* 分类管理 */}
            <CategoryManager />

            {/* 导入 / 导出 */}
            <Card>
              <h3 className="text-xs text-accent font-medium">导入 / 导出</h3>
              <p className="text-[11px] text-text-muted mt-1">导入账单文件，或导出数据用于留存与恢复</p>
              <div className="mt-3">
                <SettingRow
                  title="导入账单"
                  desc={billImport.isImporting ? (billImport.importProgress || '导入中...') : '支持支付宝 CSV、微信/平安银行 XLSX；旧 XLS 请先另存为 XLSX'}
                  disabled={billImport.isImporting}
                  onClick={billImport.openFilePicker}
                />
                {exportItems.map((item) => (
                  <SettingRow
                    key={item.title}
                    title={item.title}
                    desc={item.desc}
                    danger={item.danger}
                    onClick={item.action}
                  />
                ))}
              </div>
            </Card>

            {/* 数据备份 */}
            <BackupCard />
          </div>
        )}

        {/* 外观 */}
        {group === 'appearance' && (
          <div id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" className="space-y-5">
            <AppearanceCard />
          </div>
        )}

        {/* 危险区：破坏性操作隔离，danger 语义色边框，确认流走 ConfirmDialog */}
        {group === 'danger' && (
          <div id="settings-panel-danger" role="tabpanel" aria-labelledby="settings-tab-danger" className="space-y-5">
            <div className="rounded-card bg-bg p-4 md:p-5 lg:p-6 shadow-card border border-danger/40">
              <div className="flex items-center gap-2">
                <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-danger" />
                <h3 className="text-xs font-medium text-danger">危险区</h3>
              </div>
              <p className="text-[11px] text-text-muted mt-1 mb-2">以下操作影响范围大且不可撤销，请确认后果后再执行</p>
              <div>
                {dangerItems.map((item) => (
                  <SettingRow
                    key={item.title}
                    title={item.title}
                    desc={item.desc}
                    danger={item.danger}
                    onClick={item.action}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 导入结果详情 */}
      <ImportResultDialog
        result={billImport.importResult}
        onClose={billImport.clearResult}
      />

      {/* 列映射确认对话框 */}
      <ColumnMappingDialog
        open={billImport.learning.state.phase === 'confirming'}
        context={billImport.learning.state.phase === 'confirming' ? billImport.learning.state.context : null}
        onConfirm={billImport.learningConfirm}
        onCancel={billImport.learningCancel}
      />

      {/* 统一确认弹窗(清除数据/清除缓存) */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title}
        message={confirmAction?.message ?? ''}
        confirmText={confirmAction?.confirmText}
        danger={confirmAction?.danger}
        onConfirm={async () => {
          const act = confirmAction
          setConfirmAction(null)
          if (act) await act.onConfirm()
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
