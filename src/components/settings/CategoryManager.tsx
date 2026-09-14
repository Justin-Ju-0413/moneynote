import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Dialog } from '@/components/ui/Dialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { useCategories } from '@/hooks/useCategories'
import { useToast } from '@/components/ui/toast-context'
import type { Category } from '@/db/types'

type EditState = { mode: 'add' | 'edit'; category?: Category }

// 分类管理：列出支出/收入分类，支持新增、编辑、删除（内置禁删、删前查占用）
export function CategoryManager() {
  const { categories, expenseCategories, incomeCategories, addCategory, updateCategory, deleteCategory, isCategoryInUse } = useCategories()
  const { showToast } = useToast()
  const [edit, setEdit] = useState<EditState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null)
  const [formId, setFormId] = useState('')
  const [formName, setFormName] = useState('')
  const [formIcon, setFormIcon] = useState('other')
  const [formColor, setFormColor] = useState('#6b7b8d')
  const [formType, setFormType] = useState<'expense' | 'income'>('expense')
  const [formKeywords, setFormKeywords] = useState('')

  const openAdd = (type: 'expense' | 'income') => {
    setEdit({ mode: 'add' })
    setFormId('')
    setFormName('')
    setFormIcon('other')
    setFormColor(type === 'income' ? '#22c55e' : '#6b7b8d')
    setFormType(type)
    setFormKeywords('')
  }

  const openEdit = (c: Category) => {
    setEdit({ mode: 'edit', category: c })
    setFormId(c.id)
    setFormName(c.name)
    setFormIcon(c.icon)
    setFormColor(c.color)
    setFormType(c.type)
    setFormKeywords(c.keywords.join('、'))
  }

  const handleSave = async () => {
    if (!formName.trim()) { showToast('请填写分类名称', 'error'); return }
    const keywords = formKeywords.split(/[、,，\s]+/).filter(Boolean)
    if (edit?.mode === 'add') {
      const id = formId.trim() || formName.trim()
      if (categories.some((c) => c.id === id)) { showToast('该分类 ID 已存在', 'error'); return }
      const sortOrder = (formType === 'income' ? incomeCategories : expenseCategories).length + 1
      await addCategory({ id, name: formName.trim(), icon: formIcon, color: formColor, keywords, sortOrder, type: formType })
      showToast('分类已新增', 'success')
    } else if (edit?.mode === 'edit' && edit.category) {
      await updateCategory(edit.category.id, { name: formName.trim(), icon: formIcon, color: formColor, keywords })
      showToast('分类已更新')
    }
    setEdit(null)
  }

  const handleDelete = async (c: Category) => {
    if (c.isBuiltIn) { showToast('内置分类不可删除', 'error'); return }
    if (await isCategoryInUse(c.id)) { showToast('该分类已被交易使用，无法删除', 'error'); return }
    setConfirmDelete(c)
  }
  const doDelete = async () => {
    if (!confirmDelete) return
    await deleteCategory(confirmDelete.id)
    showToast('分类已删除')
    setConfirmDelete(null)
  }

  const renderRow = (c: Category) => (
    <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-button border border-primary-200/30">
      <div className="flex items-center gap-2.5 min-w-0">
        <CategoryIcon category={c.id} size="sm" />
        <span className="text-xs text-text truncate">{c.name}</span>
        {c.isBuiltIn && <span className="text-[10px] text-text-muted shrink-0">内置</span>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button className="text-[11px] text-accent hover:underline" onClick={() => openEdit(c)}>编辑</button>
        <button
          className="text-[11px] text-danger hover:underline disabled:opacity-30 disabled:no-underline"
          disabled={c.isBuiltIn}
          onClick={() => handleDelete(c)}
        >删除</button>
      </div>
    </div>
  )

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs text-accent font-medium">分类管理</h3>
          <p className="text-[11px] text-text-muted mt-1">管理支出与收入分类，关键词用于本地识别</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-text-muted">支出分类</span>
          <button className="text-[11px] text-accent hover:underline" onClick={() => openAdd('expense')}>+ 新增</button>
        </div>
        <div className="space-y-1.5">{expenseCategories.map(renderRow)}</div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-text-muted">收入分类</span>
          <button className="text-[11px] text-accent hover:underline" onClick={() => openAdd('income')}>+ 新增</button>
        </div>
        <div className="space-y-1.5">{incomeCategories.map(renderRow)}</div>
      </div>

      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.mode === 'add' ? '新增分类' : '编辑分类'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-text-muted mb-1.5 block">名称</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-3 py-2 rounded-input border border-primary-300/50 bg-bg text-xs outline-none text-text" />
            </div>
            <div>
              <label className="text-[11px] text-text-muted mb-1.5 block">图标</label>
              <input value={formIcon} onChange={(e) => setFormIcon(e.target.value)} className="w-full px-3 py-2 rounded-input border border-primary-300/50 bg-bg text-xs outline-none text-text" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-text-muted mb-1.5 block">颜色</label>
              <div className="flex items-center gap-2 rounded-input border border-primary-300/50 bg-bg px-3 py-2">
                <input type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)} className="w-5 h-5 bg-transparent border-0 p-0" />
                <span className="text-[10px] font-mono text-text-muted">{formColor}</span>
              </div>
            </div>
            {edit?.mode === 'add' && (
              <div>
                <label className="text-[11px] text-text-muted mb-1.5 block">类型</label>
                <div className="flex gap-1.5">
                  <Chip active={formType === 'expense'} onClick={() => setFormType('expense')}>支出</Chip>
                  <Chip active={formType === 'income'} onClick={() => setFormType('income')}>收入</Chip>
                </div>
              </div>
            )}
          </div>
          {edit?.mode === 'add' && (
            <div>
              <label className="text-[11px] text-text-muted mb-1.5 block">分类 ID（可选，缺省用名称）</label>
              <input value={formId} onChange={(e) => setFormId(e.target.value)} placeholder="如 coffee" className="w-full px-3 py-2 rounded-input border border-primary-300/50 bg-bg text-xs outline-none text-text" />
            </div>
          )}
          <div>
            <label className="text-[11px] text-text-muted mb-1.5 block">关键词（顿号/逗号分隔，用于本地识别）</label>
            <input value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)} placeholder="咖啡、coffee" className="w-full px-3 py-2 rounded-input border border-primary-300/50 bg-bg text-xs outline-none text-text" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEdit(null)} className="flex-1">取消</Button>
            <Button onClick={handleSave} className="flex-1">保存</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除分类"
        message={confirmDelete ? `确认删除分类「${confirmDelete.name}」？` : ''}
        confirmText="删除"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </Card>
  )
}
