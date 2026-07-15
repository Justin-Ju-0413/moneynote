import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ToastContext } from '@/components/ui/toast-context'
import type { Toast, ToastAction } from '@/components/ui/toast-context'

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', action?: ToastAction) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, type, action }])
    // 带操作按钮的 toast 停留更久，给用户撤销时间
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, action ? 5000 : 2500)
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const colors = {
    success: 'bg-primary-600 text-bg',
    error: 'bg-[#c94040] text-bg',
    info: 'bg-code-bg text-code-text',
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 md:left-auto md:right-8 md:translate-x-0 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              className={`${colors[toast.type]} px-5 py-2.5 text-xs tracking-widest uppercase font-medium flex items-center gap-3`}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
            >
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  className="underline underline-offset-2 font-bold hover:opacity-80"
                  onClick={() => {
                    toast.action?.onClick()
                    dismiss(toast.id)
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
