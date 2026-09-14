import { useState, useRef, useEffect } from 'react'
import { Sparkles, ArrowUp } from 'lucide-react'

interface Props {
  onSend: (text: string) => void
  sending?: boolean
}

export function ChatInput({ onSend, sending }: Props) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  // 自适应高度，封顶 120px
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [value])

  const submit = () => {
    const text = value.trim()
    if (!text || sending) return
    onSend(text)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="rounded-2xl border border-primary-300/60 bg-bg shadow-card focus-within:border-primary-400 transition-colors flex items-end gap-2 px-3 py-2">
      <span className="text-primary-400 pb-2 shrink-0" aria-hidden>
        <Sparkles size={14} strokeWidth={2} />
      </span>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="和助手聊聊… 如：午餐花了35"
        rows={1}
        className="flex-1 text-sm outline-none placeholder:text-text-placeholder bg-transparent text-text resize-none py-2 max-h-[120px]"
      />
      <button
        onClick={submit}
        disabled={!value.trim() || sending}
        aria-label="发送"
        className="w-9 h-9 rounded-full flex items-center justify-center bg-primary-600 text-bg hover:bg-primary-700 active:bg-primary-800 disabled:opacity-40 transition-colors shrink-0"
      >
        <ArrowUp size={16} strokeWidth={2.25} />
      </button>
    </div>
  )
}
