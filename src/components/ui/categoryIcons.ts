import type { LucideIcon } from 'lucide-react'
import {
  Utensils,
  Car,
  ShoppingBag,
  Gamepad2,
  House,
  Pill,
  BookOpen,
  Package,
  Banknote,
  Wrench,
  TrendingUp,
  Undo2,
  CircleDollarSign,
} from 'lucide-react'

/**
 * 统一分类图标映射：按分类 id 查表渲染 lucide 图标，不依赖 DB 的 icon 字段
 * （老用户库里 icon 仍是 emoji 也无需迁移，渲染端始终以 id 为准）。
 * 自定义分类无映射，由 CategoryIcon 兜底为分类名首字头像。
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: Utensils,
  transport: Car,
  shopping: ShoppingBag,
  entertainment: Gamepad2,
  housing: House,
  medical: Pill,
  education: BookOpen,
  other: Package,
  // 收入分类
  salary: Banknote,
  parttime: Wrench,
  investment: TrendingUp,
  refund: Undo2,
  income_other: CircleDollarSign,
}
