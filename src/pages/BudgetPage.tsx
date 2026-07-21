import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { useToast } from '@/components/ui/toast-context'
import { useCategories } from '@/hooks/useCategories'
import { db } from '@/db'
import dayjs from 'dayjs'

export function BudgetPage() {
  const { showToast } = useToast()
  const [showDialog, setShowDialog] = useState(false)
  const [editBudget, setEditBudget] = useState<{ category: string; amount: number } | null>(null)
  const [inputAmount, setInputAmount] = useState('')

  const budgets = useLiveQuery(() => db.budgets.toArray())
  const { expenseCategories, getInfo } = useCategories()

  // 本月各分类支出
  const monthSpending = useLiveQuery(async () => {
    const start = dayjs().startOf('month').format('YYYY-MM-DD')
    const end = dayjs().endOf('month').format('YYYY-MM-DD')
    const txs = await db.transactions.where('date').between(start, end, true, true).toArray()
    return txs.filter(t => t.type === 'expense').reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount
      acc['total'] = (acc['total'] || 0) + t.amount
      return acc
    }, {} as Record<string, number>)
  })

  const budgetsList = budgets || []
  const spending = monthSpending || {}
  const totalBudget = budgetsList.find(b => b.category === 'total')
  const totalSpent = spending['total'] || 0
  const totalBudgetAmount = totalBudget?.amount || 0

  const handleSaveBudget = async () => {
    if (!editBudget) return
    const amount = parseFloat(inputAmount)
    if (isNaN(amount) || amount < 0) return

    const existing = budgetsList.find(b => b.category === editBudget.category)
    if (existing) {
      await db.budgets.update(existing.id!, { amount, updatedAt: Date.now() })
    } else {
      await db.budgets.add({
        category: editBudget.category,
        amount,
        period: 'monthly',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
    showToast('预算已保存')
    setShowDialog(false)
  }

  const openBudgetDialog = (category: string) => {
    const existing = budgetsList.find(b => b.category === category)
    setEditBudget({ category, amount: existing?.amount || 0 })
    setInputAmount((existing?.amount || 0).toString())
    setShowDialog(true)
  }

  const categories = expenseCategories

  return (
    <div>
      <PageHeader title="预算" subtitle="管理每月支出" />
      <div className="px-5 space-y-5 md:px-8 md:space-y-6 lg:px-10 lg:space-y-8">
        {/* 总预算卡片 */}
        <Card className="cursor-pointer" onClick={() => openBudgetDialog('total')}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">月度总预算</span>
            <span className="text-[10px] tracking-widest uppercase text-primary-500">编辑</span>
          </div>
          {totalBudgetAmount > 0 ? (
            <>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-2xl font-heading text-text">¥{totalSpent.toFixed(0)}</span>
                <span className="text-xs text-text-muted">/ ¥{totalBudgetAmount.toFixed(0)}</span>
              </div>
              <div className="h-1 bg-primary-100 overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min((totalSpent / totalBudgetAmount) * 100, 100)}%`,
                    backgroundColor: totalSpent > totalBudgetAmount ? '#c94040' : '#0c4a94',
                  }}
                />
              </div>
              <p className="text-[10px] font-mono text-text-muted mt-2">
                {totalSpent > totalBudgetAmount
                  ? `已超出 ¥${(totalSpent - totalBudgetAmount).toFixed(0)}`
                  : `剩余 ¥${(totalBudgetAmount - totalSpent).toFixed(0)}`}
              </p>
            </>
          ) : (
            <p className="text-xs text-text-muted">点击设置月度总预算</p>
          )}
        </Card>

        {/* 各分类预算 */}
        <h2 className="text-[10px] tracking-[0.15em] uppercase text-primary-600 font-medium">分类预算</h2>
        <div className="md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 lg:gap-5">
        {categories.map((c) => {
          const budget = budgetsList.find(b => b.category === c.id)
          const spent = spending[c.id] || 0
          const budgetAmount = budget?.amount || 0

          return (
            <Card key={c.id} className="cursor-pointer" onClick={() => openBudgetDialog(c.id)}>
              <div className="flex items-center gap-3">
                <CategoryIcon category={c.id} size="sm" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-text">{c.name}</span>
                    {budgetAmount > 0 && (
                      <span className="text-[10px] font-mono text-text-muted">
                        ¥{spent.toFixed(0)} / ¥{budgetAmount.toFixed(0)}
                      </span>
                    )}
                  </div>
                  {budgetAmount > 0 ? (
                    <div className="h-1 bg-primary-100 overflow-hidden">
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${Math.min((spent / budgetAmount) * 100, 100)}%`,
                          backgroundColor: spent > budgetAmount ? '#c94040' : c.color,
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-[10px] text-text-placeholder">未设置预算</p>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
        </div>
      </div>

      {/* 设置预算弹窗 */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)} title="设置预算">
        <div className="space-y-5">
          <div>
            <label className="text-[10px] tracking-[0.15em] uppercase text-text-muted mb-1.5 block">
              {editBudget?.category === 'total' ? '月度总预算' : `${getInfo(editBudget?.category || 'other').name} 预算`}
            </label>
            <div className="flex items-center gap-2 border border-primary-300 px-3 py-2.5">
              <span className="text-text-muted text-sm">¥</span>
              <input
                type="number"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                placeholder="输入预算金额"
                className="flex-1 text-sm outline-none bg-transparent text-text"
              />
            </div>
          </div>
          <Button onClick={handleSaveBudget} className="w-full">保存</Button>
        </div>
      </Dialog>
    </div>
  )
}
