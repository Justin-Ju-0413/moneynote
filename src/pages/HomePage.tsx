import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { QuickInput } from '@/components/input/QuickInput'
import { ParsePreview } from '@/components/input/ParsePreview'
import { StatsSummary } from '@/components/stats/StatsSummary'
import { TransactionList } from '@/components/transaction/TransactionList'
import { EditDialog } from '@/components/transaction/EditDialog'
import { useNLPInput } from '@/hooks/useNLPInput'
import { useTransactions } from '@/hooks/useTransactions'
import { useToast } from '@/components/ui/Toast'
import type { Transaction } from '@/db/types'

export function HomePage() {
  const { inputValue, parsedResult, isParsing, llmStatus, llmError, handleChange, clearInput, updateParsedResult } = useNLPInput()
  const { recentTransactions, addTransaction, updateTransaction, deleteTransaction, todayExpense, monthExpense } = useTransactions()
  const { showToast } = useToast()
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null)

  const handleConfirm = async () => {
    if (!parsedResult || parsedResult.amount === null) return

    await addTransaction({
      amount: parsedResult.amount,
      category: parsedResult.category,
      date: parsedResult.date,
      time: parsedResult.time || undefined,
      note: parsedResult.note,
      type: 'expense',
      rawInput: parsedResult.rawInput,
    })

    showToast('记录成功')
    clearInput()
  }

  const handleQuickSubmit = () => {
    if (parsedResult && parsedResult.amount !== null && !parsedResult.needsReview) {
      handleConfirm()
    }
  }

  const handleSaveEdit = async (id: number, data: Partial<Transaction>) => {
    await updateTransaction(id, data)
    showToast('已更新')
  }

  const handleDelete = async (id: number) => {
    await deleteTransaction(id)
    showToast('已删除')
  }

  return (
    <div>
      <PageHeader title="记账" subtitle="自然语言输入，轻松记一笔" />
      <div className="px-5 space-y-5 md:px-8 md:space-y-6 lg:px-10 lg:space-y-8">
        {/* 自然语言输入框 */}
        <QuickInput
          value={inputValue}
          onChange={handleChange}
          onSubmit={handleQuickSubmit}
          isParsing={isParsing}
        />

        {/* 解析预览卡片 */}
        {parsedResult && (
          <ParsePreview
            result={parsedResult}
            onConfirm={handleConfirm}
            onUpdate={updateParsedResult}
            llmStatus={llmStatus}
            llmError={llmError}
          />
        )}

        {/* 今日/本月支出摘要 */}
        <StatsSummary todayExpense={todayExpense} monthExpense={monthExpense} />

        {/* 最近交易列表 */}
        <div>
          <h2 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium mb-3">最近记录</h2>
          <TransactionList
            transactions={recentTransactions}
            onItemClick={(t) => setEditTransaction(t)}
          />
        </div>
      </div>

      {/* 编辑弹窗 */}
      <EditDialog
        transaction={editTransaction}
        open={!!editTransaction}
        onClose={() => setEditTransaction(null)}
        onSave={handleSaveEdit}
        onDelete={(id) => {
          handleDelete(id)
          setEditTransaction(null)
        }}
      />
    </div>
  )
}
