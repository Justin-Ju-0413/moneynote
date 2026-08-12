import type { Transaction } from '@/db/types'

// 明细页筛选纯函数（C2-b-2）：从 HistoryPage 提取，可单测
export interface FilterOptions {
  search?: string
  category?: string
  /** 分类 id → 名称（分类名参与搜索匹配） */
  getCategoryName: (id: string) => string
}

/** 按分类 + 搜索词过滤（note 子串 / 分类名 / 金额字符串，大小写归一）；无筛选时返回全量 */
export function filterTransactions(txs: Transaction[], opts: FilterOptions): Transaction[] {
  const { search, category, getCategoryName } = opts
  if (!search && !category) return txs

  const q = search?.toLowerCase() ?? ''
  return txs.filter((t) => {
    if (category && t.category !== category) return false
    if (q) {
      const catName = getCategoryName(t.category).toLowerCase()
      const hit =
        t.note?.toLowerCase().includes(q) ||
        catName.includes(q) ||
        t.amount.toString().includes(q)
      if (!hit) return false
    }
    return true
  })
}
