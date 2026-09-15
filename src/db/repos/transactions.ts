import { db } from '@/db'
import type { Transaction } from '@/db/types'

// transactions 数据访问层（C1）：命令式查询/写，供 hook 与页面共用，为同步层铺路。
// live 能力由 hook 层 useLiveQuery 薄封装。

/** 最近 N 笔（date 倒序） */
export function getRecentTransactions(limit = 10): Promise<Transaction[]> {
  return db.transactions.orderBy('date').reverse().limit(limit).toArray()
}

/** 日期区间（含端点，date 倒序） */
export function getTransactionsByDateRange(start: string, end: string): Promise<Transaction[]> {
  return db.transactions.where('date').between(start, end, true, true).reverse().toArray()
}

/** 全量（导出/统计/查重等需要全表场景） */
export function getAllTransactions(): Promise<Transaction[]> {
  return db.transactions.toArray()
}

/** 类型 + 日期区间（走 [type+date] 复合索引） */
export function getTransactionsByTypeInRange(
  type: 'expense' | 'income',
  start: string,
  end: string,
): Promise<Transaction[]> {
  return db.transactions
    .where('[type+date]')
    .between([type, start], [type, end], true, true)
    .toArray()
}

export async function addTransaction(
  data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<number | undefined> {
  const now = Date.now()
  return db.transactions.add({ ...data, createdAt: now, updatedAt: now })
}

export async function updateTransaction(id: number, data: Partial<Transaction>): Promise<number | undefined> {
  return db.transactions.update(id, { ...data, updatedAt: Date.now() })
}

export async function deleteTransaction(id: number): Promise<void> {
  await db.transactions.delete(id)
}

/** 某分类下的交易数（删除分类前检查用） */
export function countTransactionsByCategory(categoryId: string): Promise<number> {
  return db.transactions.where('category').equals(categoryId).count()
}

// ── 明细页筛选查询下推（R2）──
// 目标：有筛选时不再 getAllTransactions() 全量加载，而是先用最选择性的索引缩小候选集，
// 其余条件只在该候选集（远小于全量）上内存过滤，最后统一 date 降序 + 分页。

/** 明细页查询条件（全部可选；limit 必填，offset 默认 0） */
export interface TransactionQuery {
  /** 备注前缀搜索（走 v14 note 索引，startsWithIgnoreCase 双范围扫描） */
  search?: string
  /** 分类 id（走 category 索引，v1 起存在） */
  category?: string
  /** 类型（配合其他条件时在候选集上内存过滤；type 仅 2 个值，不建 [type+category] 复合索引） */
  type?: 'expense' | 'income'
  /** 日期范围（含端点，YYYY-MM-DD） */
  dateStart?: string
  dateEnd?: string
  /** 金额区间（含端点） */
  amountMin?: number
  amountMax?: number
  limit: number
  offset?: number
}

/** 字符串区间上界哨兵：YYYY-MM-DD 均小于 \uffff，保证 between 上界全覆盖 */
const DATE_MAX = '\uffff'

/**
 * 索引下推查询：按「search > category > 日期范围 > type」优先级选主索引（各自走
 * note / category / date / [type+date] 索引），其余条件在候选集上内存求交集。
 * 返回 date 降序（同日按 id 降序保证分页稳定），slice(offset, offset+limit)。
 *
 * 取舍说明：
 * - 备注 = 前缀匹配而非子串：Dexie 索引仅支持前缀范围；中文无大小写问题，拉丁字母
 *   由 startsWithIgnoreCase 双范围扫描覆盖。原子串/分类名/金额搜索保留在
 *   utils/transactionFilter.filterTransactions（纯函数兜底），不走索引。
 * - 金额区间无独立索引（[date+amount+note] 中 amount 非首键无法单独范围查询），
 *   仅金额筛选时退化为全表扫 + 内存过滤——显式用户操作，可接受。
 * - 分页用 offset/limit 而非游标：明细页是「visibleCount 递增、总是从头取」的
 *   累积分页模式，游标无收益；候选集已在内存，slice 等价于 DB offset。
 */
export async function queryTransactions(opts: TransactionQuery): Promise<Transaction[]> {
  const { search, category, type, dateStart, dateEnd, amountMin, amountMax, limit, offset = 0 } = opts

  let candidates: Transaction[]
  if (search) {
    // note 索引（v14）；startsWithIgnoreCase 内部做大小写双范围扫描
    candidates = await db.transactions.where('note').startsWithIgnoreCase(search).toArray()
  } else if (category) {
    candidates = await db.transactions.where('category').equals(category).toArray()
  } else if (dateStart || dateEnd) {
    candidates = await db.transactions
      .where('date')
      .between(dateStart ?? '', dateEnd ?? DATE_MAX, true, true)
      .toArray()
  } else if (type) {
    candidates = await db.transactions
      .where('[type+date]')
      .between([type, ''], [type, DATE_MAX], true, true)
      .toArray()
  } else {
    // 仅金额区间等无索引可用条件：orderBy('date') 全表扫（离线本地库，可接受）
    candidates = await db.transactions.orderBy('date').toArray()
  }

  const filtered = candidates.filter((t) => {
    if (category && t.category !== category) return false
    if (type && t.type !== type) return false
    if (dateStart && t.date < dateStart) return false
    if (dateEnd && t.date > dateEnd) return false
    if (amountMin != null && t.amount < amountMin) return false
    if (amountMax != null && t.amount > amountMax) return false
    return true
  })

  filtered.sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0))
  return filtered.slice(offset, offset + limit)
}
