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
): Promise<number> {
  const now = Date.now()
  return db.transactions.add({ ...data, createdAt: now, updatedAt: now })
}

export async function updateTransaction(id: number, data: Partial<Transaction>): Promise<number> {
  return db.transactions.update(id, { ...data, updatedAt: Date.now() })
}

export async function deleteTransaction(id: number): Promise<void> {
  await db.transactions.delete(id)
}

/** 某分类下的交易数（删除分类前检查用） */
export function countTransactionsByCategory(categoryId: string): Promise<number> {
  return db.transactions.where('category').equals(categoryId).count()
}
