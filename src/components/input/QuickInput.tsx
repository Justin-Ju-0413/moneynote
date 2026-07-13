import { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'

interface QuickInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isParsing: boolean
}

export function QuickInput({ value, onChange, onSubmit, isParsing }: QuickInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      onSubmit()
    }
  }

  return (
    <div className="relative">
      <motion.div
        className="border-2 border-primary-400 bg-bg overflow-hidden"
        animate={{
          borderColor: value.trim() ? '#0c4a94' : 'rgba(14, 84, 166, 0.4)',
        }}
      >
        <div className="flex items-center px-4 py-3 md:px-5 md:py-4">
          <span className="text-primary-500 text-xs font-heading mr-3 tracking-widest">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="记一笔... 如：午餐花了35元"
            className="flex-1 text-sm md:text-base outline-none placeholder:text-text-placeholder bg-transparent text-text"
          />
          {value && (
            <button
              onClick={() => onChange('')}
              className="text-text-muted hover:text-primary-600 ml-2 text-sm"
            >
              ×
            </button>
          )}
        </div>
        {isParsing && (
          <div className="px-4 pb-2">
            <div className="h-px bg-primary-100 overflow-hidden">
              <motion.div
                className="h-full bg-primary-500"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
