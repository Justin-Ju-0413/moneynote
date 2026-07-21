import { useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import type { Category } from '@/db/types'
import { CATEGORY_MAP } from '@/utils/constants'

export interface CategoryInfo {
  name: string
  icon: string
  color: string
}

const EMPTY_CATEGORIES: Category[] = []

// 分类统一入口：从 db.categories 动态读取，库未就绪时回退 CATEGORY_MAP 兜底，避免白屏。
// 阶段 2 用此 hook 替换散落各处的 CATEGORY_MAP 直接访问，使自定义分类全局生效。
export function useCategories() {
  const categories = useLiveQuery(() => db.categories.toArray(), [], EMPTY_CATEGORIES) as Category[]

  const byId = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  // 查找分类信息（库未就绪时回退 CATEGORY_MAP）
  const getInfo = useCallback((id: string): CategoryInfo => {
    const c = byId.get(id)
    if (c) return { name: c.name, icon: c.icon, color: c.color }
    const fallback = CATEGORY_MAP[id]
    return fallback ?? { name: id, icon: '📦', color: '#6b7b8d' }
  }, [byId])

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense').sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  )
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'income').sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  )

  const addCategory = useCallback(async (data: Omit<Category, 'isBuiltIn'>) => {
    return db.categories.add({ ...data, isBuiltIn: false } as Category)
  }, [])

  const updateCategory = useCallback(async (id: string, data: Partial<Category>) => {
    return db.categories.update(id, data)
  }, [])

  const deleteCategory = useCallback(async (id: string) => {
    return db.categories.delete(id)
  }, [])

  // 该分类是否被交易在用（删除前检查）
  const isCategoryInUse = useCallback(async (id: string) => {
    const count = await db.transactions.where('category').equals(id).count()
    return count > 0
  }, [])

  return {
    categories,
    byId,
    getInfo,
    expenseCategories,
    incomeCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    isCategoryInUse,
  }
}
