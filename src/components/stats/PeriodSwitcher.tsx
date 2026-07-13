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
    <div className="flex items-center justify-between">
      <div className="flex border border-primary-300/50">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            className={`px-4 py-2.5 min-h-11 text-[10px] tracking-widest uppercase font-medium transition-colors ${
              period === p.value
                ? 'bg-primary-600 text-bg'
                : 'text-text-muted hover:text-primary-600'
            }`}
            onClick={() => onChange(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onPrev} className="w-9 h-9 min-w-11 min-h-11 flex items-center justify-center text-text-muted hover:text-primary-600 text-lg">
          ‹
        </button>
        <span className="text-[10px] tracking-widest uppercase font-medium text-primary-600 min-w-[70px] text-center">{label}</span>
        <button onClick={onNext} className="w-9 h-9 min-w-11 min-h-11 flex items-center justify-center text-text-muted hover:text-primary-600 text-lg">
          ›
        </button>
      </div>
    </div>
  )
}
