import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { NAV_TABS } from '@/utils/constants'
import { BottomNav } from './BottomNav'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      {/* 桌面侧边栏 */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-56 lg:border-r lg:border-primary-200/30 lg:bg-bg lg:z-20">
        <div className="px-6 pt-10 pb-6">
          <p className="font-heading text-sm tracking-widest text-primary-700">MoneyNote</p>
          <p className="text-[10px] tracking-widest uppercase text-text-muted mt-1">智能记账</p>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 text-xs tracking-widest uppercase font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-bg'
                    : 'text-text-muted hover:text-primary-600 hover:bg-primary-50/40'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* 主内容区 */}
      <main className="pb-20 lg:pb-8 lg:pl-56">
        <div className="max-w-4xl mx-auto">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
