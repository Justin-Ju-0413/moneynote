import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // onClose 常为父组件内联箭头函数，进 ref 避免焦点管理 effect 随渲染反复重挂
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const restoreTo = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      // Tab 圈定：焦点在弹窗内循环，不逃逸到底层页面
      if (e.key !== 'Tab' || !panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreTo?.focus?.()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-code-bg/30 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className="fixed bottom-0 left-0 right-0 z-50 bg-bg border-t border-primary-200/60 rounded-t-2xl p-5 md:p-6 max-h-[85vh] overflow-y-auto safe-area-bottom outline-none md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:w-full md:max-h-[90vh] md:rounded-2xl md:border md:shadow-elevated"
            initial={{ y: '100%', opacity: 1 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 1 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {title && (
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-heading text-base md:text-lg text-heading">{title}</h3>
                <button
                  onClick={onClose}
                  aria-label="关闭"
                  className="w-9 h-9 flex items-center justify-center rounded-full text-text-muted text-xl leading-none hover:text-accent hover:bg-primary-50/60 transition-colors"
                >
                  ×
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
