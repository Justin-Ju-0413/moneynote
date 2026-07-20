import { useState, useRef, useEffect } from 'react'

interface Props {
  onSend: (text: string) => void
  sending?: boolean
}

export function ChatInput({ onSend, sending }: Props) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  // 自适应高度,封顶 120px
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
    <div className="border-2 border-primary-400 bg-bg flex items-end gap-2 px-3 py-2">
      <span className="text-primary-500 text-xs font-heading tracking-widest pb-2">{'>'}</span>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="和助手聊聊… 如:午餐花了35"
        rows={1}
        className="flex-1 text-sm outline-none placeholder:text-text-placeholder bg-transparent text-text resize-none py-2 max-h-[120px]"
      />
      <button
        onClick={submit}
        disabled={!value.trim() || sending}
        className="px-3 py-2 text-[10px] tracking-widest uppercase font-medium bg-primary-600 text-bg disabled:opacity-40 transition-opacity"
      >
        发送
      </button>
    </div>
  )
}
