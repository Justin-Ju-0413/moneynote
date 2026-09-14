import { useCategories } from '@/hooks/useCategories'
import { CATEGORY_ICONS } from './categoryIcons'

interface CategoryIconProps {
  category: string
  size?: 'sm' | 'md' | 'lg'
}

// 现代亲和风：柔和色底圆角容器 + 分类色 lucide 图标；自定义分类走首字头像
const SIZES = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-12 h-12' } as const
const ICON_SIZES = { sm: 16, md: 18, lg: 20 } as const
const AVATAR_TEXT = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' } as const

export function CategoryIcon({ category, size = 'md' }: CategoryIconProps) {
  const { getInfo } = useCategories()
  const info = getInfo(category)
  const Icon = CATEGORY_ICONS[category]
  return (
    <div
      className={`flex items-center justify-center rounded-xl shrink-0 ${SIZES[size]}`}
      style={{ backgroundColor: `${info.color}1A`, color: info.color }}
      role="img"
      aria-label={info.name}
    >
      {Icon ? (
        <Icon size={ICON_SIZES[size]} aria-hidden="true" />
      ) : (
        <span className={`font-heading ${AVATAR_TEXT[size]}`} aria-hidden="true">
          {info.name.charAt(0)}
        </span>
      )}
    </div>
  )
}
