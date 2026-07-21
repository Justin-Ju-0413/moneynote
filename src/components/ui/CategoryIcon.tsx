import { useCategories } from '@/hooks/useCategories'

interface CategoryIconProps {
  category: string
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
}

export function CategoryIcon({ category, size = 'md' }: CategoryIconProps) {
  const { getInfo } = useCategories()
  const info = getInfo(category)
  return (
    <div
      className={`flex items-center justify-center border ${sizes[size]}`}
      style={{ borderColor: `${info.color}40`, color: info.color }}
    >
      <span className="text-xs font-heading">{info.icon}</span>
    </div>
  )
}
