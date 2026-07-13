import { NavLink } from 'react-router-dom'
import { NAV_TABS } from '@/utils/constants'

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-bg/95 backdrop-blur-sm border-t divider-blue safe-area-bottom z-30 lg:hidden">
      <div className="flex items-center justify-around h-14">
        {NAV_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex items-center justify-center h-11 min-w-11 px-4 text-xs tracking-widest uppercase font-medium transition-colors ${
                isActive
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-text-muted hover:text-primary-500'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
