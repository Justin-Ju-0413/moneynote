import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// 路由级懒加载：把 recharts(统计页)/xlsx(设置页) 等拆出首屏 bundle
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const StatsPage = lazy(() => import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const BudgetPage = lazy(() => import('@/pages/BudgetPage').then((m) => ({ default: m.BudgetPage })))
const AIWorkspacePage = lazy(() => import('@/pages/AIWorkspacePage').then((m) => ({ default: m.AIWorkspacePage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

const PageFallback = (
  <div className="flex items-center justify-center min-h-[60vh]">
    <span className="text-xs tracking-widest uppercase text-text-muted">加载中…</span>
  </div>
)

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.2 }}
      >
        <Suspense fallback={PageFallback}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/ai-workspace" element={<AIWorkspacePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell>
        <ErrorBoundary>
          <AnimatedRoutes />
        </ErrorBoundary>
      </AppShell>
    </ToastProvider>
  )
}
