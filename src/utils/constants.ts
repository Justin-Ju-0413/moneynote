export const CATEGORY_MAP: Record<string, { name: string; icon: string; color: string }> = {
  food: { name: '餐饮', icon: '🍜', color: '#f97316' },
  transport: { name: '交通', icon: '🚗', color: '#3b82f6' },
  shopping: { name: '购物', icon: '🛍️', color: '#ec4899' },
  entertainment: { name: '娱乐', icon: '🎮', color: '#8b5cf6' },
  housing: { name: '住房', icon: '🏠', color: '#14b8a6' },
  medical: { name: '医疗', icon: '💊', color: '#ef4444' },
  education: { name: '教育', icon: '📚', color: '#f59e0b' },
  other: { name: '其他', icon: '📦', color: '#6b7b8d' },
}

export const PERIODS = [
  { value: 'day', label: '日' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
] as const

export type PeriodType = (typeof PERIODS)[number]['value']

export const NAV_TABS = [
  { to: '/', label: '记账' },
  { to: '/stats', label: '统计' },
  { to: '/history', label: '明细' },
  { to: '/budget', label: '预算' },
  { to: '/settings', label: '设置' },
] as const
