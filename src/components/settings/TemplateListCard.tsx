import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ui/toast-context'
import { TemplateDetailDialog } from '@/components/input/TemplateDetailDialog'
import { deleteTemplate } from '@/bill-analyzer/templateMatcher'
import type { BillTemplate } from '@/db/types'

interface TemplateListCardProps {
  templates: BillTemplate[]
}

/** 账单模板卡：已学习模板列表 + 详情弹窗。列表数据由页面传入（导入流程也要读模板） */
export function TemplateListCard({ templates }: TemplateListCardProps) {
  const { showToast } = useToast()
  const [selectedTemplate, setSelectedTemplate] = useState<BillTemplate | null>(null)

  const handleDeleteTemplate = async (id: number) => {
    try {
      await deleteTemplate(id)
      showToast('模板已删除')
      setSelectedTemplate(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error')
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">账单模板</h3>
          <p className="text-[10px] text-text-muted mt-1">已学习 {templates.length} 种格式，自动识别导入文件</p>
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
                <span className={`w-1.5 h-1.5 rounded-full ${tmpl.isBuiltIn ? 'bg-primary-500' : 'bg-success'}`} />
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

      <TemplateDetailDialog
        open={!!selectedTemplate}
        template={selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        onDelete={handleDeleteTemplate}
      />
    </Card>
  )
}
