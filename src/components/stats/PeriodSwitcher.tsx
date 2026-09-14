import { PERIODS } from '@/utils/constants'
import type { PeriodType } from '@/utils/constants'

interface PeriodSwitcherProps {
  period: PeriodType
  onChange: (period: PeriodType) => void
  label: string
  onPrev: () => void
  onNext: () => void
}

export function PeriodSwitcher({ period, onChange, label, onPrev, onNext }: PeriodSwitcherProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      {/* 胶囊分段器：外圈 44px+ 触摸高度 */}
      <div className="flex rounded-full border border-primary-300/50 bg-bg p-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            className={`px-4 py-2 min-h-9 rounded-full text-xs font-medium transition-colors ${
              period === p.value
                ? 'bg-primary-600 text-bg shadow-sm'
                : 'text-text-muted hover:text-accent'
            }`}
            onClick={() => onChange(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          aria-label="上一期"
          className="w-11 h-11 rounded-full flex items-center justify-center text-text-muted hover:text-accent hover:bg-primary-50/50 text-lg transition-colors"
        >
          ‹
        </button>
        <span className="text-xs font-medium text-accent min-w-[70px] text-center">{label}</span>
        <button
          onClick={onNext}
          aria-label="下一期"
          className="w-11 h-11 rounded-full flex items-center justify-center text-text-muted hover:text-accent hover:bg-primary-50/50 text-lg transition-colors"
        >
          ›
        </button>
      </div>
    </div>
  )
}
