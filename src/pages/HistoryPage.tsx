import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '@/components/layout/PageHeader'
import { TransactionList } from '@/components/transaction/TransactionList'
import { EditDialog } from '@/components/transaction/EditDialog'
import { useTransactions } from '@/hooks/useTransactions'
import { useToast } from '@/components/ui/Toast'
import { CATEGORY_MAP } from '@/utils/constants'
import { db } from '@/db'
import type { Transaction } from '@/db/types'

export function HistoryPage() {
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null)
  const { updateTransaction, deleteTransaction } = useTransactions()
  const { showToast } = useToast()

  const transactions = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().toArray(),
  ) || []

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filterCategory && t.category !== filterCategory) return false
      if (search) {
        const q = search.toLowerCase()
        const catName = CATEGORY_MAP[t.category]?.name || ''
        return (
          t.note?.toLowerCase().includes(q) ||
          catName.toLowerCase().includes(q) ||
          t.amount.toString().includes(q)
        )
      }
      return true
    })
  }, [transactions, search, filterCategory])

  const categories = Object.entries(CATEGORY_MAP)

  const handleSave = async (id: number, data: Partial<Transaction>) => {
    await updateTransaction(id, data)
    showToast('已更新')
  }

  const handleDelete = async (id: number) => {
    await deleteTransaction(id)
    showToast('已删除')
    setEditTransaction(null)
  }

  return (
    <div>
      <PageHeader title="明细" subtitle="全部交易记录" />
      <div className="px-5 space-y-4 md:px-8 md:space-y-5 lg:px-10 lg:space-y-6">
        {/* 搜索框 */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索备注、分类、金额..."
          className="w-full px-4 py-2.5 md:py-3 border border-primary-300/50 text-sm outline-none bg-transparent text-text placeholder:text-text-placeholder"
        />

        {/* 分类筛选 */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          <button
            className={`px-3 py-2.5 min-h-11 text-[10px] tracking-widest uppercase font-medium whitespace-nowrap transition-colors ${
              !filterCategory ? 'bg-primary-600 text-bg' : 'border border-primary-300/50 text-text-muted hover:text-primary-600'
            }`}
            onClick={() => setFilterCategory('')}
          >
            全部
          </button>
          {categories.map(([id, info]) => (
            <button
              key={id}
              className={`px-3 py-2.5 min-h-11 text-[10px] tracking-widest uppercase font-medium whitespace-nowrap transition-colors ${
                filterCategory === id ? 'bg-primary-600 text-bg' : 'border border-primary-300/50 text-text-muted hover:text-primary-600'
              }`}
              onClick={() => setFilterCategory(filterCategory === id ? '' : id)}
            >
              {info.name}
            </button>
          ))}
        </div>

        {/* 交易列表 */}
        <TransactionList
          transactions={filteredTransactions}
          onItemClick={(t) => setEditTransaction(t)}
        />
      </div>

      <EditDialog
        transaction={editTransaction}
        open={!!editTransaction}
        onClose={() => setEditTransaction(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
