interface ToggleProps {
  checked: boolean
  onChange: () => void
  /** 无障碍标签（视觉隐藏时必填，供读屏器识别） */
  label?: string
  title?: string
}

/** 统一开关：40×20 轨道 + 16 滑块，滑块用 transform 位移保证动画顺滑 */
export function Toggle({ checked, onChange, label, title }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary-600' : 'bg-primary-200/50'}`}
    >
      <span
        className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-bg shadow-sm transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  )
}
