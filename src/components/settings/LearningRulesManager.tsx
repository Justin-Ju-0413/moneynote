import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { deleteLearningRule } from '@/nlp/learningRules'
import { useCategories } from '@/hooks/useCategories'
import { useToast } from '@/components/ui/toast-context'
import { Card } from '@/components/ui/Card'
import type { LearningRule } from '@/db/types'

// 学习规则管理：展示 AI 沉淀的商户→分类映射，可删除（防学错）
export function LearningRulesManager() {
  const rules = (useLiveQuery(
    () => db.learningRules.orderBy('updatedAt').reverse().toArray(),
  ) ?? []) as LearningRule[]
  const { getInfo } = useCategories()
  const { showToast } = useToast()

  const handleDelete = async (id: number) => {
    await deleteLearningRule(id)
    showToast('规则已删除')
  }

  if (rules.length === 0) {
    return (
      <Card>
        <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">学习规则</h3>
        <p className="text-[10px] text-text-muted mt-1">AI 根据你的确认和修正自动学习，识别会越来越准。暂无已学规则。</p>
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">学习规则</h3>
      <p className="text-[10px] text-text-muted mt-1">AI 根据你的确认和修正自动学习，识别会越来越准</p>
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
            </div>
            <button className="text-[10px] text-[#c94040] hover:underline shrink-0" onClick={() => handleDelete(r.id!)}>删除</button>
          </div>
        ))}
      </div>
    </Card>
  )
}
