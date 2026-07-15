import { useState } from 'react'
import type { Transaction } from '@/db/types'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { CATEGORY_MAP } from '@/utils/constants'

interface EditDialogProps {
  transaction: Transaction | null
  open: boolean
  onClose: () => void
  onSave: (id: number, data: Partial<Transaction>) => void
  onDelete: (id: number) => void
}

const categories = Object.entries(CATEGORY_MAP)

export function EditDialog({ transaction, open, onClose, onSave, onDelete }: EditDialogProps) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState('')
  const [syncKey, setSyncKey] = useState('')

  // transaction/open 变化时同步表单（render 期调整状态，避免 effect 级联渲染）
  const nextSyncKey = transaction ? `${transaction.id ?? 'new'}|${open}` : `|${open}`
  if (nextSyncKey !== syncKey) {
    setSyncKey(nextSyncKey)
    if (transaction && open) {
      setAmount(transaction.amount.toString())
      setNote(transaction.note || '')
      setCategory(transaction.category)
      setDate(transaction.date)
    }
  }

  const handleSave = () => {
    if (!transaction) return
    onSave(transaction.id!, {
      amount: parseFloat(amount) || transaction.amount,
      note,
      category,
      date,
    })
    onClose()
  }

  const handleDelete = () => {
    if (!transaction) return
    onDelete(transaction.id!)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="编辑记录">
      <div className="space-y-5">
        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5 block">金额</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2.5 border border-primary-300 text-sm outline-none bg-transparent text-text"
          />
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5 block">备注</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2.5 border border-primary-300 text-sm outline-none bg-transparent text-text"
          />
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5 block">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-primary-300 text-sm outline-none bg-transparent text-text"
          />
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-2 block">分类</label>
          <div className="grid grid-cols-4 md:grid-cols-5 gap-2">
            {categories.map(([id, info]) => (
              <button
                key={id}
                className={`flex flex-col items-center gap-1 p-2 min-h-11 min-w-11 transition-colors ${
                  category === id ? 'bg-primary-100/50 border border-primary-400' : 'border border-transparent hover:bg-primary-50/30'
                }`}
                onClick={() => setCategory(id)}
              >
                <CategoryIcon category={id} size="sm" />
                <span className="text-[10px] text-text-secondary">{info.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="danger" onClick={handleDelete} className="flex-1">
            删除
          </Button>
          <Button onClick={handleSave} className="flex-1">
            保存
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
