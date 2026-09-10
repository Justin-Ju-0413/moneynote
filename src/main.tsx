import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { requestPersistentStorage, initAutoBackup } from './utils/backup'
import { getAppearance, applyAppearance, watchSystemTheme } from './utils/appearance'
import './styles/index.css'

// 启动时请求持久化存储并初始化自动备份
requestPersistentStorage()
initAutoBackup()

// 外观主题：index.html 内联脚本已先行设置避免闪烁，这里接管后续系统主题变化
applyAppearance(getAppearance())
watchSystemTheme(() => applyAppearance(getAppearance()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
