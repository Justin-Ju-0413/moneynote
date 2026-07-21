import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '@/components/layout/PageHeader'
import { TransactionList } from '@/components/transaction/TransactionList'
import { EditDialog } from '@/components/transaction/EditDialog'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useTransactions } from '@/hooks/useTransactions'
import { useDedup } from '@/hooks/useDedup'
import { useCategories } from '@/hooks/useCategories'
import { useToast } from '@/components/ui/toast-context'
import { db } from '@/db'
import type { Transaction, DedupRecord } from '@/db/types'

const EMPTY_TRANSACTIONS: Transaction[] = []
const PAGE_SIZE = 50

export function HistoryPage() {
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null)
  const [showDedup, setShowDedup] = useState(false)
  const [dedupBusy, setDedupBusy] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { updateTransaction, deleteTransaction } = useTransactions()
  const { showToast } = useToast()
  const { pendingRecords, txMap, detect, handleDuplicate } = useDedup()
  const { getInfo, expenseCategories, incomeCategories } = useCategories()
  const categories = [...expenseCategories, ...incomeCategories]

  const isFiltering = !!search || !!filterCategory

  const handleDetect = async () => {
    setDedupBusy(true)
    const count = await detect()
    showToast(count > 0 ? `发现 ${count} 组疑似重复` : '未发现疑似重复', count > 0 ? 'success' : 'info')
    setDedupBusy(false)
  }

  const handleDedupAction = async (record: DedupRecord, action: 'MERGE_KEEP_A' | 'MERGE_KEEP_B' | 'IGNORE') => {
    const deleted = await handleDuplicate(record, action)
    showToast(
      action === 'IGNORE' ? '已忽略' : '已合并',
      'success',
      deleted ? { label: '撤销', onClick: () => db.transactions.put(deleted) } : undefined,
    )
  }

  // 无筛选时分页加载（limit visibleCount），有筛选时全量加载后内存 filter
  const transactions = useLiveQuery(
    async () => {
      if (isFiltering) {
        const all = await db.transactions.orderBy('date').reverse().toArray()
        return all.filter((t) => {
          if (filterCategory && t.category !== filterCategory) return false
          if (search) {
            const q = search.toLowerCase()
            const catName = getInfo(t.category).name
            return (
              t.note?.toLowerCase().includes(q) ||
              catName.toLowerCase().includes(q) ||
              t.amount.toString().includes(q)
            )
          }
          return true
        })
      }
      return db.transactions.orderBy('date').reverse().limit(visibleCount).toArray()
    },
    [isFiltering, search, filterCategory, visibleCount, getInfo],
  ) ?? EMPTY_TRANSACTIONS

  // 搜索/筛选变化时重置分页（在事件回调里 setState，避免 effect 级联渲染）
  const handleSearchChange = (v: string) => {
    setSearch(v)
    setVisibleCount(PAGE_SIZE)
  }
  const handleCategoryChange = (id: string) => {
    setFilterCategory(id)
    setVisibleCount(PAGE_SIZE)
  }

  // 无筛选时滚动到底加载更多；transactions.length < visibleCount 表示已无更多
  useEffect(() => {
    if (isFiltering) return
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && transactions.length >= visibleCount) {
        setVisibleCount((c) => c + PAGE_SIZE)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [isFiltering, transactions.length, visibleCount])

  const handleSave = async (id: number, data: Partial<Transaction>) => {
    await updateTransaction(id, data)
    showToast('已更新')
  }

  const handleDelete = async (id: number) => {
    const tx = editTransaction
    await deleteTransaction(id)
    showToast('已删除', 'success', tx ? { label: '撤销', onClick: () => db.transactions.put(tx) } : undefined)
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
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="搜索备注、分类、金额..."
          className="w-full px-4 py-2.5 md:py-3 border border-primary-300/50 text-sm outline-none bg-transparent text-text placeholder:text-text-placeholder"
        />

        {/* 分类筛选 */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          <button
            className={`px-3 py-2.5 min-h-11 text-[10px] tracking-widest uppercase font-medium whitespace-nowrap transition-colors ${
              !filterCategory ? 'bg-primary-600 text-bg' : 'border border-primary-300/50 text-text-muted hover:text-primary-600'
            }`}
            onClick={() => handleCategoryChange('')}
          >
            全部
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`px-3 py-2.5 min-h-11 text-[10px] tracking-widest uppercase font-medium whitespace-nowrap transition-colors ${
                filterCategory === c.id ? 'bg-primary-600 text-bg' : 'border border-primary-300/50 text-text-muted hover:text-primary-600'
              }`}
              onClick={() => handleCategoryChange(filterCategory === c.id ? '' : c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* 查重审核入口 */}
        <div className="flex justify-end -mt-1">
          <button
            onClick={() => setShowDedup(true)}
            className="px-3 py-1.5 text-[10px] tracking-widest uppercase font-medium border border-primary-300/50 text-text-muted hover:text-primary-600 transition-colors"
          >
            查重审核 {pendingRecords.length > 0 ? `· ${pendingRecords.length}` : ''}
          </button>
        </div>

        {/* 交易列表 */}
        <TransactionList
          transactions={transactions}
          onItemClick={(t) => setEditTransaction(t)}
        />
        {/* 无筛选时的滚动哨兵，触底加载下一页 */}
        {!isFiltering && <div ref={sentinelRef} className="h-4" />}
      </div>

      <EditDialog
        transaction={editTransaction}
        open={!!editTransaction}
        onClose={() => setEditTransaction(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {/* 查重审核弹窗 */}
      <Dialog open={showDedup} onClose={() => setShowDedup(false)} title="查重审核">
        <div className="space-y-3">
          {pendingRecords.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-6">
              {dedupBusy ? '检测中…' : '暂无疑似重复流水，可点击下方重新检测'}
            </p>
          ) : (
            pendingRecords.map((r) => {
              const a = txMap.get(r.entryAId)
              const b = txMap.get(r.entryBId)
              if (!a || !b) return null
              return (
                <div key={r.id} className="border border-primary-200/40 p-3 space-y-2">
                  <p className="text-[10px] text-text-muted">相似度 {Math.round(r.similarity * 100)}%</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="border border-primary-200/30 p-2">
                      <p className="text-[10px] text-text-muted">{a.date}</p>
                      <p className="text-[11px] text-text truncate">{a.note || '(无备注)'}</p>
                      <p className="text-xs font-heading text-text mt-0.5">
                        {a.type === 'income' ? '+' : '-'}¥{a.amount.toFixed(2)}
                      </p>
                    </div>
                    <div className="border border-primary-200/30 p-2">
                      <p className="text-[10px] text-text-muted">{b.date}</p>
                      <p className="text-[11px] text-text truncate">{b.note || '(无备注)'}</p>
                      <p className="text-xs font-heading text-text mt-0.5">
                        {b.type === 'income' ? '+' : '-'}¥{b.amount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => handleDedupAction(r, 'MERGE_KEEP_A')} className="flex-1">保留A删B</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDedupAction(r, 'MERGE_KEEP_B')} className="flex-1">保留B删A</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDedupAction(r, 'IGNORE')} className="flex-1">忽略</Button>
                  </div>
                </div>
              )
            })
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={handleDetect} disabled={dedupBusy} className="flex-1">
              {dedupBusy ? '检测中...' : '重新检测'}
            </Button>
            <Button variant="ghost" onClick={() => setShowDedup(false)} className="flex-1">关闭</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
