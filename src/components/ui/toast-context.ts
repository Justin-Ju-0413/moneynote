import { createContext, useContext } from 'react'

export interface ToastAction {
  label: string
  onClick: () => unknown
}

export interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  action?: ToastAction
}

export interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info', action?: ToastAction) => void
}

export const ToastContext = createContext<ToastContextType>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}
