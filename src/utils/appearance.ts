export type Appearance = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'appearance'

export function getAppearance(): Appearance {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function setAppearance(a: Appearance): void {
  localStorage.setItem(STORAGE_KEY, a)
  applyAppearance(a)
}

/** 解析出实际主题（system 跟随媒体查询） */
export function resolveTheme(a: Appearance): 'light' | 'dark' {
  if (a === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return a
}

/** 应用到 html[data-theme] 并同步 PWA theme-color（供 index.html 内联脚本与本模块共用） */
export function applyAppearance(a: Appearance): void {
  const theme = resolveTheme(a)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0e1721' : '#f0f4f8')
}

/** 跟随系统时监听系统主题切换（返回取消函数） */
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
