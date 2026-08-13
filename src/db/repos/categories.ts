import { db } from '@/db'
import type { Category } from '@/db/types'

// categories 数据访问层（C1）：命令式查询/写，供 hook 与页面共用。

export function getCategories(): Promise<Category[]> {
  return db.categories.toArray()
}

export async function addCategory(data: Omit<Category, 'isBuiltIn'>): Promise<string> {
  return db.categories.add({ ...data, isBuiltIn: false } as Category)
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<number> {
  return db.categories.update(id, data)
}

export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id)
}
