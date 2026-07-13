import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import type { BillTemplate } from '@/db/types'
import { getRoleLabel } from '@/components/input/ColumnMappingDialog'

interface TemplateDetailDialogProps {
  open: boolean
  template: BillTemplate | null
  onClose: () => void
  onDelete?: (id: number) => void
}

export function TemplateDetailDialog({
  open,
  template,
  onClose,
  onDelete,
}: TemplateDetailDialogProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!template) return null

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    if (template.id && onDelete) {
      onDelete(template.id)
    }
    setConfirmDelete(false)
    onClose()
  }

  return (
    <Dialog open={open} onClose={() => { setConfirmDelete(false); onClose() }} title={template.name}>
      <div className="space-y-4">
        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-primary-200/50 p-3">
            <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">来源</p>
            <p className="text-xs font-heading text-text">{template.source}</p>
          </div>
          <div className="border border-primary-200/50 p-3">
            <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">类型</p>
            <p className="text-xs font-heading text-text">
              {template.isBuiltIn ? '内置' : '已学习'} · {template.fileType.toUpperCase()}
            </p>
          </div>
          <div className="border border-primary-200/50 p-3">
            <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">导入次数</p>
            <p className="text-xs font-heading text-primary-600">{template.importCount} 次</p>
          </div>
          <div className="border border-primary-200/50 p-3">
            <p className="text-[10px] tracking-widest uppercase text-text-muted mb-1">列数</p>
            <p className="text-xs font-heading text-text">{template.columnMappings.length} 列</p>
          </div>
        </div>

        {/* 列映射 */}
        <div>
          <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2">列映射</p>
          <div className="border border-primary-200/50 overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-primary-50/30 border-b border-primary-200/50">
                  <th className="px-2 py-1.5 text-left text-text-muted font-medium">列名</th>
                  <th className="px-2 py-1.5 text-left text-text-muted font-medium">角色</th>
                  <th className="px-2 py-1.5 text-left text-text-muted font-medium">类型</th>
                </tr>
              </thead>
              <tbody>
                {template.columnMappings.map((m, i) => (
                  <tr key={i} className="border-b border-primary-200/20">
                    <td className="px-2 py-1 text-text">{m.normalizedHeader || '(空)'}</td>
                    <td className="px-2 py-1">
                      <span className={`px-1.5 py-0.5 ${m.role === 'skip' ? 'text-text-placeholder' : 'text-primary-600 bg-primary-50'}`}>
                        {getRoleLabel(m.role)}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-text-muted">{m.inferredType || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 过滤规则 */}
        {template.filterRules.length > 0 && (
          <div>
            <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2">过滤规则</p>
            <div className="space-y-1">
              {template.filterRules.map((r, i) => (
                <div key={i} className="text-[10px] text-text-secondary border border-primary-200/30 px-2 py-1">
                  列 {r.columnIndex}: {r.type} {r.value ? `"${r.value}"` : ''} → {r.reason}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 操作 */}
        <div className="flex gap-2 pt-1">
          <Button onClick={onClose} variant="secondary" className="flex-1">关闭</Button>
          {!template.isBuiltIn && onDelete && (
            <Button
              onClick={handleDelete}
              className="flex-1 !bg-[#c94040] !text-white"
            >
              {confirmDelete ? '确认删除？' : '删除模板'}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
