import { Dialog } from './Dialog'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// 统一确认弹窗,替代浏览器原生 confirm()(PWA 里原生弹窗突兀且不可定制)
export function ConfirmDialog({
  open,
  title = '确认操作',
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="space-y-5">
        <p className="text-sm text-text leading-relaxed whitespace-pre-line">{message}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="flex-1">{cancelText}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} className="flex-1">{confirmText}</Button>
        </div>
      </div>
    </Dialog>
  )
}
