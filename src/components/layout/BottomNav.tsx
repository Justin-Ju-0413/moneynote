import { NavLink } from 'react-router-dom'
import { NAV_TABS } from '@/utils/constants'

// 移动端底栏：图标 + 小字竖排，active 用 accent 色与顶部短横线指示
export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-bg/95 backdrop-blur-sm border-t divider-blue safe-area-bottom z-30 lg:hidden">
      <div className="flex items-stretch h-14">
        {NAV_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center justify-center gap-1 h-14 text-[10px] leading-none font-medium transition-colors ${
                isActive ? 'text-accent' : 'text-text-muted hover:text-primary-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={`absolute top-0 h-[3px] rounded-full transition-all duration-200 ${
                    isActive ? 'w-7 bg-primary-600' : 'w-0'
                  }`}
                />
                <tab.icon size={20} strokeWidth={isActive ? 2.2 : 1.75} aria-hidden="true" />
                <span>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
