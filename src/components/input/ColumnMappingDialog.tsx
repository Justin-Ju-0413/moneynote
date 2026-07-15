import { useState, useMemo } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import type { ColumnRole, ColumnMapping } from '@/db/types'
import type { LearningContext } from '@/bill-analyzer/learningFlow'
import { ROLE_OPTIONS } from './roleLabels'

interface ColumnMappingDialogProps {
  open: boolean
  context: LearningContext | null
  onConfirm: (name: string, mappings: ColumnMapping[]) => void
  onCancel: () => void
}

export function ColumnMappingDialog({
  open,
  context,
  onConfirm,
  onCancel,
}: ColumnMappingDialogProps) {
  const [name, setName] = useState('')
  const [roles, setRoles] = useState<(ColumnRole | null)[]>([])
  const [syncedContext, setSyncedContext] = useState<LearningContext | null>(null)

  // context 变化时同步初始值（render 期调整状态，避免 effect 级联渲染）
  if (context !== syncedContext) {
    setSyncedContext(context)
    if (context) {
      setName(context.suggestedName)
      setRoles([...context.columnRoles])
    }
  }

  // 样本数据（取表头后 3 行）
  const sampleRows: string[][] = useMemo(() => {
    if (!context) return []
    const headerIndex = context.fingerprint.headerRowIndex
    const grid = context.grid
    const rows: string[][] = []
    for (let i = headerIndex + 1; i < Math.min(headerIndex + 4, grid.length); i++) {
      const row = grid[i]
      if (!row) continue
      rows.push(row.map(c => {
        if (c instanceof Date) {
          const y = c.getFullYear()
          const m = String(c.getMonth() + 1).padStart(2, '0')
          const d = String(c.getDate()).padStart(2, '0')
          return `${y}-${m}-${d}`
        }
        return String(c ?? '').trim()
      }))
    }
    return rows
  }, [context])

  if (!context) return null

  const { headers, columnMappings, preview, warnings } = context

  const handleRoleChange = (colIndex: number, role: ColumnRole) => {
    const newRoles = [...roles]
    newRoles[colIndex] = role
    setRoles(newRoles)
  }

  const handleConfirm = () => {
    if (!name.trim()) return

    // 根据用户修改的角色更新 columnMappings
    const updatedMappings = columnMappings.map((m, i) => ({
      ...m,
      role: roles[i] || 'skip' as ColumnRole,
    }))

    onConfirm(name.trim(), updatedMappings)
  }

  // 检查必需列是否存在
  const hasDate = roles.includes('date')
  const hasAmount = roles.includes('amount')
  const isValid = name.trim() && hasDate && hasAmount

  return (
    <Dialog open={open} onClose={onCancel} title="确认列映射">
      <div className="space-y-4">
        {/* 格式名称 */}
        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5 block">
            格式名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：招商银行信用卡"
            className="w-full px-3 py-2 border border-primary-300/50 text-xs outline-none bg-transparent text-text placeholder:text-text-placeholder"
          />
        </div>

        {/* 列映射表格 */}
        <div>
          <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2">列映射</p>
          <div className="border border-primary-200/50 overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-primary-50/30 border-b border-primary-200/50">
                  <th className="px-2 py-1.5 text-left text-text-muted font-medium">列名</th>
                  <th className="px-2 py-1.5 text-left text-text-muted font-medium w-24">角色</th>
                  <th className="px-2 py-1.5 text-left text-text-muted font-medium">样本数据</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header, i) => (
                  <tr key={i} className="border-b border-primary-200/20">
                    <td className="px-2 py-1.5 text-text font-medium whitespace-nowrap">
                      {header || <span className="text-text-placeholder">空</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={roles[i] || 'skip'}
                        onChange={(e) => handleRoleChange(i, e.target.value as ColumnRole)}
                        className="w-full px-1 py-0.5 border border-primary-300/50 text-[10px] outline-none bg-transparent text-text"
                      >
                        {ROLE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-text-muted truncate max-w-[120px]">
                      {sampleRows[0]?.[i] || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 必需列检查 */}
        {!hasDate && (
          <p className="text-[10px] text-[#c94040]">请指定一个「日期」列</p>
        )}
        {!hasAmount && (
          <p className="text-[10px] text-[#c94040]">请指定一个「金额」列</p>
        )}

        {/* 预览解析结果 */}
        {preview.length > 0 && (
          <div>
            <p className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2">解析预览</p>
            <div className="space-y-1.5">
              {preview.slice(0, 3).map((row, i) => (
                <div key={i} className="text-[10px] text-text-secondary border border-primary-200/30 px-2 py-1.5">
                  <span className="font-heading text-primary-600">{row.fields['交易时间']}</span>
                  {' '}
                  <span>{row.fields['收/支'] === '收入' ? '+' : '-'}{row.fields['金额']}</span>
                  {' '}
                  <span className="text-text-muted">{row.fields['商品说明'] || row.fields['备注'] || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 警告信息 */}
        {warnings.length > 0 && (
          <div className="text-[10px] text-[#c94040] space-y-0.5">
            {warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-1">
          <Button onClick={onCancel} variant="secondary" className="flex-1">取消</Button>
          <Button onClick={handleConfirm} className="flex-1" disabled={!isValid}>
            确认并导入
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
