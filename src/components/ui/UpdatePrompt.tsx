import { useRegisterSW } from 'virtual:pwa-register/react'

// PWA 更新提示:检测到新版本时弹窗,由用户主动刷新(而非 autoUpdate 静默刷新),
// 避免已安装用户长期跑旧缓存而不知有新版。配合 registerType:'prompt' 使用。
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      console.error('SW 注册失败', err)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 md:left-auto md:right-6 md:translate-x-0 border-2 border-primary-400 bg-bg p-4 shadow-elevated max-w-sm w-[calc(100%-2rem)] safe-area-bottom">
      <p className="text-xs text-text mb-3">检测到新版本,刷新以更新。</p>
      <div className="flex gap-2">
        <button
          className="flex-1 px-3 py-2 text-[10px] tracking-widest uppercase font-medium bg-primary-600 text-bg transition-colors hover:bg-primary-700"
          onClick={() => updateServiceWorker(true)}
        >
          立即刷新
        </button>
        <button
          className="flex-1 px-3 py-2 text-[10px] tracking-widest uppercase font-medium border border-primary-300/50 text-text-muted transition-colors hover:text-primary-600"
          onClick={() => setNeedRefresh(false)}
        >
          稍后
        </button>
      </div>
    </div>
  )
}
