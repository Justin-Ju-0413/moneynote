import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { deleteLearningRule, cleanupColdRules, exportLearningRules, importLearningRules } from '@/nlp/learningRules'
import { useCategories } from '@/hooks/useCategories'
import { useToast } from '@/components/ui/toast-context'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { downloadFile } from '@/utils/export'
import type { LearningRule } from '@/db/types'

// 学习规则管理：展示 AI 沉淀的商户→分类映射，可删除（防学错）
// B3：统计条（规则数/累计命中/约节省 LLM 调用）+ 命中计量展示 + 冷规则清理
// B4：独立导出/导入（导入跳过已存在）
export function LearningRulesManager() {
  const rules = (useLiveQuery(
    () => db.learningRules.orderBy('updatedAt').reverse().toArray(),
  ) ?? []) as LearningRule[]
  const { getInfo } = useCategories()
  const { showToast } = useToast()
  const [confirmCleanup, setConfirmCleanup] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const handleDelete = async (id: number) => {
    await deleteLearningRule(id)
    showToast('规则已删除')
  }

  const handleCleanup = async () => {
    setConfirmCleanup(false)
    const removed = await cleanupColdRules(180)
    showToast(removed > 0 ? `已清理 ${removed} 条冷规则` : '没有 180 天未命中的规则')
  }

  const handleExport = async () => {
    const json = await exportLearningRules()
    const date = new Date().toISOString().split('T')[0]
    downloadFile(json, `moneynote-learning-rules_${date}.json`, 'application/json')
    showToast('学习规则已导出')
  }

  const handleImportClick = () => {
    importInputRef.current?.click()
  }

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return
    try {
      const text = await file.text()
      const { imported, skipped } = await importLearningRules(text)
      showToast(imported > 0 ? `导入 ${imported} 条${skipped > 0 ? `，跳过 ${skipped} 条已存在` : ''}` : `没有可导入的规则${skipped > 0 ? `（跳过 ${skipped} 条已存在）` : ''}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导入失败', 'error')
    }
  }

  // B3 统计：命中一次本地规则即避免一次 LLM 调用/低置信度 Review（近似口径）
  const totalHits = rules.reduce((sum, r) => sum + (r.matchCount ?? 0), 0)

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">学习规则</h3>
        <div className="flex gap-2 shrink-0">
          <button className="text-[10px] text-primary-600 hover:underline" onClick={handleExport}>导出</button>
          <button className="text-[10px] text-primary-600 hover:underline" onClick={handleImportClick}>导入</button>
        </div>
      </div>
      <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
      <p className="text-[10px] text-text-muted mt-1">
        AI 根据你的确认和修正自动学习，识别会越来越准
        {rules.length > 0 && (
          <span className="text-primary-600"> · {rules.length} 条规则 · 累计命中 {totalHits} 次 · 约节省 {totalHits} 次 LLM 调用</span>
        )}
      </p>
      <p className="text-[10px] text-text-muted mt-1">规则含消费习惯，导出文件请妥善保管</p>
      {rules.length === 0 && (
        <p className="text-[10px] text-text-muted mt-1">暂无已学规则。</p>
      )}
      {rules.length > 0 && (
        <>
          <div className="mt-3 space-y-1.5">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2 border border-primary-200/30">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-text truncate">{r.merchant}</span>
                  <span className="text-[10px] text-text-muted">→ {getInfo(r.category).name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${r.source === 'manual' ? 'bg-primary-100/40 text-primary-700' : 'bg-primary-50/40 text-text-muted'}`}>
                    {r.source === 'manual' ? '手动' : 'LLM'}
                  </span>
                  <span className="text-[9px] text-text-muted">{r.hitCount} 次</span>
                  <span className="text-[9px] text-text-muted">命中 {(r.matchCount ?? 0)} 次</span>
                  <span className="text-[9px] text-text-muted">
                    {new Date(r.lastHitAt ?? r.updatedAt).toLocaleString()}
                  </span>
                </div>
                <button className="text-[10px] text-[#c94040] hover:underline shrink-0" onClick={() => handleDelete(r.id!)}>删除</button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button className="text-[10px] text-text-muted hover:text-primary-600" onClick={() => setConfirmCleanup(true)}>
              清理 180 天未命中规则
            </button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirmCleanup}
        title="清理冷规则"
        message="将删除 180 天内从未命中的学习规则（旧数据无命中记录的不受影响），同时撤回其提炼的分类关键词。确定继续？"
        confirmText="清理"
        danger
        onConfirm={handleCleanup}
        onCancel={() => setConfirmCleanup(false)}
      />
    </Card>
  )
}
