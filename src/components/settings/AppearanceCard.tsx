import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { getAppearance, setAppearance, type Appearance } from '@/utils/appearance'

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

/** 外观设置卡：三态切换，写入 localStorage 并即时应用到 html[data-theme] */
export function AppearanceCard() {
  const [appearance, setLocal] = useState<Appearance>(getAppearance)

  const handleSelect = (a: Appearance) => {
    setAppearance(a)
    setLocal(a)
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-[10px] tracking-[0.15em] uppercase text-accent font-medium">外观</h3>
          <p className="text-[10px] text-text-muted mt-1">选择浅色、深色或跟随系统自动切换</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {OPTIONS.map((o) => (
            <Chip key={o.value} active={appearance === o.value} onClick={() => handleSelect(o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>
    </Card>
  )
}
