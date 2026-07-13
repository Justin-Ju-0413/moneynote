import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useAIWorkspace } from '@/hooks/useAIWorkspace'
import { useLLMSettings } from '@/hooks/useLLMSettings'
import { db } from '@/db'
import type { Transaction } from '@/db/types'
import { CATEGORY_MAP } from '@/utils/constants'
import type { AuditTask, AiSuggestion, SuggestionType } from '@/llm/types'

const TASKS: { task: AuditTask; label: string; desc: string; icon: string }[] = [
  { task: 'audit', label: '综合审计', desc: '异常 + 重复 + 分类', icon: '🛡' },
  { task: 'categorize', label: '自动归类', desc: '批量分类建议', icon: '🏷' },
  { task: 'dedupe', label: '智能查重', desc: 'AI 找重复流水', icon: '⧉' },
  { task: 'analyzeMonth', label: '月度摘要', desc: '本月消费总结', icon: '☰' },
]

const TYPE_META: Record<SuggestionType, { label: string; color: string }> = {
  category: { label: '分类建议', color: '#3b82f6' },
  duplicate: { label: '疑似重复', color: '#f97316' },
  anomaly: { label: '异常提醒', color: '#ef4444' },
  summary: { label: '月度摘要', color: '#8b5cf6' },
}

function formatAmount(amount: number, type: string) {
  return `${type === 'income' ? '+' : '-'}¥${amount.toFixed(2)}`
}

export function AIWorkspacePage() {
  const { showToast } = useToast()
  const { saveConfig } = useLLMSettings()
  const {
    pendingSuggestions,
    running,
    error,
    lastCount,
    cachedHit,
    progress,
    forceRefresh,
    setForceRefresh,
    selectedMonth,
    setSelectedMonth,
    runTask,
    applySuggestion,
    dismissSuggestion,
    clearAll,
    cleanupProcessed,
    hasApiKey,
    privacyMode,
  } = useAIWorkspace()

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const txCount = transactions.length
  const txMap = useMemo(
    () => new Map(transactions.map((t) => [t.id as number, t])),
    [transactions],
  )

  const handleRun = async (task: AuditTask) => {
    if (running) return
    await runTask(task)
  }

  const handleApply = async (s: AiSuggestion) => {
    let oldCategory: string | undefined
    if (s.type === 'category' && s.transactionIds.length > 0) {
      oldCategory = (await db.transactions.get(s.transactionIds[0]))?.category
    }
    await applySuggestion(s)
    showToast(
      '已应用建议',
      'success',
      s.type === 'category' && oldCategory
        ? { label: '撤销', onClick: () => db.transactions.update(s.transactionIds[0], { category: oldCategory, updatedAt: Date.now() }) }
        : undefined,
    )
  }

  const handleDismiss = async (id: number) => {
    await dismissSuggestion(id)
  }

  const handleClear = async () => {
    if (!confirm('确定清空所有建议记录吗？')) return
    await clearAll()
    showToast('已清空')
  }

  const handleCleanupProcessed = async () => {
    await cleanupProcessed()
    showToast('已清除已处理建议')
  }

  const handlePrivacyToggle = async () => {
    await saveConfig({ privacyMode: !privacyMode })
    showToast(privacyMode ? '已关闭脱敏' : '已开启脱敏', 'info')
  }

  return (
    <div>
      <PageHeader title="AI 工作台" subtitle="统一运行审计、归类、查重与月度摘要" />
      <div className="px-5 space-y-5 md:px-8 md:space-y-6 lg:px-10 lg:space-y-8">
        {/* 任务区 */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">任务</h3>
              <p className="text-[10px] text-text-muted mt-1">
                {hasApiKey ? `已连接 AI · 共 ${txCount} 笔流水` : '未配置 AI · 将使用本地规则回退'}
              </p>
            </div>
            <button
              className={`w-10 h-5 rounded-full transition-colors relative ${privacyMode ? 'bg-primary-600' : 'bg-primary-200/50'}`}
              onClick={handlePrivacyToggle}
              title="发送给 AI 前脱敏手机号/订单号/身份证等"
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-bg rounded-full transition-transform ${privacyMode ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {TASKS.map((t) => (
              <button
                key={t.task}
                disabled={running || txCount === 0}
                onClick={() => handleRun(t.task)}
                className={`flex flex-col items-start gap-1 p-3 border text-left transition-colors ${
                  running
                    ? 'border-primary-200/30 opacity-50'
                    : 'border-primary-300/50 hover:bg-primary-50/40 hover:border-primary-400'
                }`}
              >
                <span className="text-base">{t.icon}</span>
                <span className="text-xs font-medium text-text">{t.label}</span>
                <span className="text-[10px] text-text-muted">{t.desc}</span>
              </button>
            ))}
          </div>

          {/* 月度摘要的月份选择 */}
          <div className="flex items-center gap-2 mt-3">
            <label className="text-[10px] tracking-widest uppercase text-text-muted">摘要月份</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-2 py-1 border border-primary-300/50 text-xs bg-transparent text-text outline-none"
            />
            <span className="text-[10px] text-text-muted">用于「月度摘要」任务</span>
          </div>

          {running && (
            <p className="text-[10px] text-primary-600 mt-3 animate-pulse">
              AI 分析中…{progress ? ` (${progress.current}/${progress.total})` : ''}
            </p>
          )}
          {error && (
            <p className="text-[10px] text-[#c94040] mt-3">提示：{error}</p>
          )}
          {!running && lastCount > 0 && (
            <p className={`text-[10px] mt-3 ${cachedHit ? 'text-primary-500' : 'text-green-600'}`}>
              {cachedHit ? `命中缓存，新增 ${lastCount} 条建议（未消耗 API）` : `新增 ${lastCount} 条建议，请在下方审核。`}
            </p>
          )}

          {/* 强制刷新开关 */}
          <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forceRefresh}
              onChange={(e) => setForceRefresh(e.target.checked)}
              className="accent-primary-600"
            />
            <span className="text-[10px] text-text-muted">强制刷新（忽略缓存，重新调用 AI）</span>
          </label>
        </Card>

        {/* 待审核建议 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">
              待审核建议 · {pendingSuggestions.length}
            </h3>
            {pendingSuggestions.length > 0 && (
              <div className="flex gap-3">
                <button className="text-[10px] text-text-muted hover:text-primary-600" onClick={handleCleanupProcessed}>
                  清除已处理
                </button>
                <button className="text-[10px] text-text-muted hover:text-[#c94040]" onClick={handleClear}>
                  清空
                </button>
              </div>
            )}
          </div>

          {pendingSuggestions.length === 0 ? (
            <Card>
              <EmptyState
                icon="✦"
                title="暂无待审核建议"
                description="运行上方任务后，AI 建议会出现在这里供你逐条确认"
              />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {pendingSuggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  txMap={txMap}
                  onApply={() => handleApply(s)}
                  onDismiss={() => s.id !== undefined && handleDismiss(s.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface SuggestionCardProps {
  suggestion: AiSuggestion
  txMap: Map<number, Transaction>
  onApply: () => void
  onDismiss: () => void
}

function SuggestionCard({ suggestion, txMap, onApply, onDismiss }: SuggestionCardProps) {
  const meta = TYPE_META[suggestion.type]
  const isSummary = suggestion.type === 'summary'
  const txs = suggestion.transactionIds
    .map((id) => txMap.get(id))
    .filter((t): t is NonNullable<typeof t> => !!t)

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Badge color={meta.color}>{meta.label}</Badge>
          <span className="text-[10px] text-text-muted">
            置信度 {Math.round(suggestion.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* 摘要类：突出展示结论 */}
      {isSummary && (
        <p className="text-sm font-heading text-primary-700 mb-2">{suggestion.result}</p>
      )}

      {/* 分类建议：展示建议分类 */}
      {suggestion.type === 'category' && (
        <p className="text-xs text-text mb-2">
          建议分类为
          <span className="font-heading text-primary-600 mx-1">
            {CATEGORY_MAP[suggestion.result]?.name || suggestion.result}
          </span>
        </p>
      )}

      {/* 关联流水 */}
      {txs.length > 0 && (
        <div className="space-y-1 mb-2">
          {txs.slice(0, 3).map((t) => (
            <div key={t.id} className="flex items-center justify-between text-[10px] text-text-muted">
              <span className="truncate max-w-[60%]">{t.note || '(无备注)'}</span>
              <span className="font-heading text-text">{formatAmount(t.amount, t.type)}</span>
            </div>
          ))}
          {txs.length > 3 && <p className="text-[10px] text-text-placeholder">等 {txs.length} 笔</p>}
        </div>
      )}

      <p className="text-[10px] text-text-secondary leading-relaxed mb-3">{suggestion.reason}</p>

      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={onApply} className="flex-1">
          {suggestion.type === 'category' ? '应用' : suggestion.type === 'duplicate' ? '合并去重' : '确认'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} className="flex-1">
          忽略
        </Button>
      </div>
    </Card>
  )
}
