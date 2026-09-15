import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { useToast } from '@/components/ui/toast-context'
import { useCategories } from '@/hooks/useCategories'
import { getTransactionsByTypeInRange } from '@/db/repos/transactions'
import { computeRangeStats, getCategoryMonthlyAverage } from '@/db/repos/stats'
import { db } from '@/db'
import { Lightbulb } from 'lucide-react'
import dayjs from 'dayjs'

/** 预算使用分档：<80% 正常 / 80%~100% 警示 / ≥100% 超支 */
type BudgetTier = 'normal' | 'warning' | 'danger'

function usageTier(spent: number, budget: number): BudgetTier {
  if (budget <= 0) return 'normal'
  const ratio = spent / budget
  if (ratio >= 1) return 'danger'
  if (ratio >= 0.8) return 'warning'
  return 'normal'
}

/** 分档进度条填充色：正常用分类原色/语义色，警示 amber，超支红 */
function tierBarColor(tier: BudgetTier, normalColor: string): string {
  if (tier === 'danger') return 'var(--color-danger)'
  if (tier === 'warning') return 'var(--color-warning)'
  return normalColor
}

export function BudgetPage() {
  const { showToast } = useToast()
  const [showDialog, setShowDialog] = useState(false)
  const [editBudget, setEditBudget] = useState<{ category: string; amount: number } | null>(null)
  const [inputAmount, setInputAmount] = useState('')

  const budgets = useLiveQuery(() => db.budgets.toArray())
  const { expenseCategories, getInfo } = useCategories()

  // 本月各分类支出（走 [type+date] 索引 + 纯函数聚合）
  const monthSpending = useLiveQuery(async (): Promise<Record<string, number>> => {
    const start = dayjs().startOf('month').format('YYYY-MM-DD')
    const end = dayjs().endOf('month').format('YYYY-MM-DD')
    const txs = await getTransactionsByTypeInRange('expense', start, end)
    const byCategory = computeRangeStats(txs).byCategory
    return {
      ...byCategory,
      total: txs.reduce((s, t) => s + t.amount, 0),
    }
  })

  const budgetsList = budgets || []
  const spending = monthSpending || {}
  const totalBudget = budgetsList.find(b => b.category === 'total')
  const totalSpent = spending['total'] || 0
  const totalBudgetAmount = totalBudget?.amount || 0
  const totalTier = usageTier(totalSpent, totalBudgetAmount)

  // 本月日均可用余额 =（预算 - 已支出）/ 当月剩余天数（含今天）；除零/无预算/已超支时不展示
  const now = dayjs()
  const remainingDays = now.endOf('month').diff(now, 'day') + 1
  const remainingMoney = totalBudgetAmount - totalSpent
  const dailyAvailable =
    totalBudgetAmount > 0 && remainingDays > 0 && remainingMoney > 0
      ? remainingMoney / remainingDays
      : null

  // 弹窗内的预算建议：近 3 个完整月（不含当月）该分类月均支出，仅提示不自动填入
  const suggestion = useLiveQuery(
    async () => {
      if (!editBudget) return null
      return getCategoryMonthlyAverage(editBudget.category, { months: 3 })
    },
    [editBudget?.category],
    null,
  )

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
            <span className="text-xs text-accent font-medium">月度总预算</span>
            <span className="text-[11px] text-primary-500 hover:text-primary-400 transition-colors">编辑</span>
          </div>
          {totalBudgetAmount > 0 ? (
            <>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-2xl font-heading tabular-nums text-text">¥{totalSpent.toFixed(0)}</span>
                <span className="text-xs text-text-muted tabular-nums">/ ¥{totalBudgetAmount.toFixed(0)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-primary-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min((totalSpent / totalBudgetAmount) * 100, 100)}%`,
                    backgroundColor: tierBarColor(totalTier, 'var(--color-expense)'),
                  }}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {totalTier === 'danger' ? (
                  <span className="text-[11px] tabular-nums inline-flex items-center rounded-full px-2.5 py-1 bg-danger/10 text-danger">
                    已超出 ¥{(totalSpent - totalBudgetAmount).toFixed(0)}
                  </span>
                ) : totalTier === 'warning' ? (
                  <span className="text-[11px] tabular-nums inline-flex items-center rounded-full px-2.5 py-1 bg-warning/10 text-warning">
                    已用 {Math.round((totalSpent / totalBudgetAmount) * 100)}%，接近预算
                  </span>
                ) : (
                  <span className="text-[11px] tabular-nums text-text-muted">
                    剩余 ¥{(totalBudgetAmount - totalSpent).toFixed(0)}
                  </span>
                )}
                {dailyAvailable !== null && (
                  <span className="text-[11px] tabular-nums text-text-muted">
                    日均可用 ¥{dailyAvailable < 100 ? dailyAvailable.toFixed(1) : dailyAvailable.toFixed(0)} · 剩 {remainingDays} 天
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-text-muted">点击设置月度总预算</p>
          )}
        </Card>

        {/* 各分类预算 */}
        <h2 className="text-xs text-accent font-medium">分类预算</h2>
        <div className="md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 lg:gap-5">
        {categories.map((c) => {
          const budget = budgetsList.find(b => b.category === c.id)
          const spent = spending[c.id] || 0
          const budgetAmount = budget?.amount || 0
          const tier = usageTier(spent, budgetAmount)

          return (
            <Card key={c.id} className="cursor-pointer" onClick={() => openBudgetDialog(c.id)}>
              <div className="flex items-center gap-3">
                <CategoryIcon category={c.id} size="sm" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-text">{c.name}</span>
                    {budgetAmount > 0 && (
                      <span className="text-[10px] font-mono tabular-nums text-text-muted">
                        ¥{spent.toFixed(0)} / ¥{budgetAmount.toFixed(0)}
                      </span>
                    )}
                  </div>
                  {budgetAmount > 0 ? (
                    <>
                      <div className="h-1.5 rounded-full bg-primary-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min((spent / budgetAmount) * 100, 100)}%`,
                            backgroundColor: tierBarColor(tier, c.color),
                          }}
                        />
                      </div>
                      {tier !== 'normal' && (
                        <span
                          className={`text-[10px] tabular-nums mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 ${
                            tier === 'danger' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'
                          }`}
                        >
                          {tier === 'danger'
                            ? `超支 ¥${(spent - budgetAmount).toFixed(0)}`
                            : `已用 ${Math.round((spent / budgetAmount) * 100)}%，注意控制`}
                        </span>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-text-placeholder">未设置预算</p>
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
            <label className="text-[11px] text-text-muted mb-1.5 block">
              {editBudget?.category === 'total' ? '月度总预算' : `${getInfo(editBudget?.category || 'other').name} 预算`}
            </label>
            <div className="flex items-center gap-2 rounded-input border border-primary-300/70 bg-bg px-3 py-2.5">
              <span className="text-text-muted text-sm">¥</span>
              <input
                type="number"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                placeholder="输入预算金额"
                className="flex-1 text-sm outline-none bg-transparent text-text"
              />
            </div>
            {suggestion && suggestion.monthsWithData > 0 && (
              <p className="text-[11px] text-text-muted mt-2 flex items-center gap-1.5">
                <Lightbulb size={12} strokeWidth={1.75} className="text-primary-400 shrink-0" />
                近 {suggestion.monthsWithData} 个月月均支出
                <span className="font-mono tabular-nums text-text">¥{suggestion.average.toFixed(0)}</span>
                ，可作预算参考
              </p>
            )}
          </div>
          <Button onClick={handleSaveBudget} className="w-full">保存</Button>
        </div>
      </Dialog>
    </div>
  )
}
