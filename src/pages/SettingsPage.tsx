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

/** 设置项行：导入账单与 settingItems 共用的点击行样式 */
function SettingRow({ title, desc, danger, disabled, onClick }: {
  title: string
  desc: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <div
      className={`cursor-pointer hover:bg-primary-50/20 px-4 py-4 md:px-5 md:py-5 transition-colors border-b border-primary-200/30 last:border-b-0 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-xs font-medium ${danger ? 'text-danger' : 'text-text'}`}>{title}</p>
          <p className="text-[10px] text-text-muted mt-0.5">{desc}</p>
        </div>
        <span className="text-text-placeholder text-sm">›</span>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { showToast } = useToast()
  const llm = useLLMForm()
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

  const settingItems: SettingItem[] = [
    { title: '导出 CSV', desc: '导出为 Excel 可打开的表格文件', action: handleExportCSV },
    { title: '导出 JSON', desc: '导出为备份文件，可用于恢复', action: handleExportJSON },
    { title: '清除 AI 缓存', desc: `分类缓存 ${cacheCount} 条 + 解析缓存 ${parseCacheCount} 条`, action: handleClearCache },
    { title: '清除所有数据', desc: '删除所有交易记录、预算和缓存', action: handleClearData, danger: true },
  ]

  return (
    <div>
      <PageHeader title="设置" subtitle="个性化你的应用" />
      <div className="px-5 space-y-5 md:px-8 md:space-y-6 lg:px-10 lg:space-y-8">
        {/* 隐藏的文件选择器：ref 由页面持有直接挂载，触发走 billImport.openFilePicker */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={billImport.onFileSelected}
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
        <TemplateListCard templates={templates} />

        {/* AI 学习规则 */}
        <LearningRulesManager />

        {/* 分类管理 */}
        <CategoryManager />

        {/* AI 智能解析 */}
        <LLMSettingsCard llm={llm} />

        {/* 数据备份 */}
        <BackupCard />

        {/* 设置项 */}
        <div className="space-y-0 border-t border-b border-primary-200/30">
          <SettingRow
            title="导入账单"
            desc={billImport.isImporting ? (billImport.importProgress || '导入中...') : '支持支付宝 CSV、微信/平安银行 XLSX；旧 XLS 请先另存为 XLSX'}
            disabled={billImport.isImporting}
            onClick={billImport.openFilePicker}
          />
          {settingItems.map((item) => (
            <SettingRow
              key={item.title}
              title={item.title}
              desc={item.desc}
              danger={item.danger}
              onClick={item.action}
            />
          ))}
        </div>

        {/* 关于 */}
        <Card>
          <div className="text-center py-3">
            <p className="font-heading text-lg text-primary-700 mb-1">MoneyNote</p>
            <p className="text-[10px] tracking-widest uppercase text-text-muted">AI 智能记账 · v{APP_VERSION}</p>
            <div className="h-px bg-primary-200/30 my-3" />
            <p className="text-[10px] text-text-placeholder">自然语言输入，轻松记一笔</p>
          </div>
        </Card>
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
