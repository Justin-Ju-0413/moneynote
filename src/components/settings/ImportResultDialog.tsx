import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useCategories } from '@/hooks/useCategories'
import type { ClassifyResult } from '@/utils/billClassifier'

export interface ImportResultDetail {
  sourceName: string
  imported: number
  skipped: number
  filtered: number
  classifyResult: ClassifyResult
}

interface ImportResultDialogProps {
  result: ImportResultDetail | null
  onClose: () => void
}

/** 导入结果详情弹窗：基础统计 + AI 分类统计 + 分类分布（纯展示） */
export function ImportResultDialog({ result, onClose }: ImportResultDialogProps) {
  const { getInfo } = useCategories()

  // 计算分类分布
  const dist = (() => {
    if (!result) return []
    const counter: Record<string, number> = {}
    for (const tx of result.classifyResult.transactions) {
      counter[tx.category] = (counter[tx.category] || 0) + 1
    }
    return Object.entries(counter)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({
        id: cat,
        name: getInfo(cat).name,
        icon: getInfo(cat).icon,
        count,
        pct: Math.round(count / result.classifyResult.transactions.length * 100),
      }))
  })()

  return (
    <Dialog open={!!result} onClose={onClose} title="导入结果">
      {result && (() => {
        const cr = result.classifyResult
        return (
          <div className="space-y-5">
            {/* 基础统计 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-primary-200/50 p-3">
                <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">来源</p>
                <p className="text-sm font-heading text-text">{result.sourceName}</p>
              </div>
              <div className="border border-primary-200/50 p-3">
                <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">新增</p>
                <p className="text-sm font-heading text-primary-600">{result.imported} 笔</p>
              </div>
              <div className="border border-primary-200/50 p-3">
                <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">跳过重复</p>
                <p className="text-sm font-heading text-text">{result.skipped} 笔</p>
              </div>
              <div className="border border-primary-200/50 p-3">
                <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">过滤无效</p>
                <p className="text-sm font-heading text-text">{result.filtered} 笔</p>
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
                      <span className="w-2 h-2 bg-success rounded-full" />
                      <span className="text-text-secondary">缓存命中</span>
                      <span className="font-heading text-text">{cr.cacheHitCount} 笔</span>
                    </div>
                  )}
                  {cr.llmFailedCount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-danger rounded-full" />
                      <span className="text-text-secondary">失败</span>
                      <span className="font-heading text-text">{cr.llmFailedCount} 笔</span>
                    </div>
                  )}
                </div>
                {cr.llmErrorDetail && (
                  <p className="text-[10px] text-danger mt-2">错误详情: {cr.llmErrorDetail}</p>
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

            <Button onClick={onClose} className="w-full">关闭</Button>
          </div>
        )
      })()}
    </Dialog>
  )
}
