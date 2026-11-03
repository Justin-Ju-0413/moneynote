import type { LucideIcon } from 'lucide-react'
import { MessageSquareText, ChartPie, ReceiptText, Wallet, Sparkles, Settings } from 'lucide-react'

// icon 字段存 categoryIcons.ts 的映射 key（按 id 渲染 lucide 图标），不再存 emoji
export const CATEGORY_MAP: Record<string, { name: string; icon: string; color: string }> = {
  food: { name: '餐饮', icon: 'food', color: '#f97316' },
  transport: { name: '交通', icon: 'transport', color: '#3b82f6' },
  shopping: { name: '购物', icon: 'shopping', color: '#ec4899' },
  entertainment: { name: '娱乐', icon: 'entertainment', color: '#8b5cf6' },
  housing: { name: '住房', icon: 'housing', color: '#14b8a6' },
  medical: { name: '医疗', icon: 'medical', color: '#ef4444' },
  education: { name: '教育', icon: 'education', color: '#f59e0b' },
  other: { name: '其他', icon: 'other', color: '#6b7b8d' },
  // 收入分类
  salary: { name: '工资', icon: 'salary', color: '#22c55e' },
  parttime: { name: '兼职', icon: 'parttime', color: '#84cc16' },
  investment: { name: '投资收益', icon: 'investment', color: '#10b981' },
  refund: { name: '退款', icon: 'refund', color: '#06b6d4' },
  income_other: { name: '其他收入', icon: 'income_other', color: '#6b7280' },
}

export const PERIODS = [
  { value: 'day', label: '日' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
] as const

export type PeriodType = (typeof PERIODS)[number]['value']

export interface NavTab {
  to: string
  label: string
  icon: LucideIcon
}

// 导航：每项带 lucide 图标，桌面侧栏/移动底栏共用
export const NAV_TABS: NavTab[] = [
  { to: '/', label: '记账', icon: MessageSquareText },
  { to: '/stats', label: '统计', icon: ChartPie },
  { to: '/history', label: '明细', icon: ReceiptText },
  { to: '/budget', label: '预算', icon: Wallet },
  { to: '/ai-workspace', label: 'AI', icon: Sparkles },
  { to: '/settings', label: '设置', icon: Settings },
]

// 应用版本号：package.json 与设置页「关于」均引用此常量，保持单一来源
export const APP_VERSION = '1.8.0'
