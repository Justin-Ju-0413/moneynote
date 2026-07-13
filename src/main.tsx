import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { requestPersistentStorage, initAutoBackup } from './utils/backup'
import './styles/index.css'

// 启动时请求持久化存储并初始化自动备份
requestPersistentStorage()
initAutoBackup()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
