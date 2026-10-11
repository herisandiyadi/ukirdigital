import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { performLogout } from '@/services/logout'
import clsx from 'clsx'
import { ReactNode } from 'react'
import {
  LayoutDashboard, Upload, History, Settings, LogOut, ChevronRight,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/convert',    icon: Upload,           label: 'Konversi Baru' },
  { to: '/history',    icon: History,          label: 'Riwayat' },
  { to: '/settings',   icon: Settings,         label: 'Pengaturan' },
]

export default function UserLayout({ children }: { children?: ReactNode }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await performLogout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col bg-white border-r border-gray-200">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-100">
          <img
            src="/ukirdigital-logo.png"
            alt="ukir digital logo"
            className="h-9 rounded-lg"
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          {(user?.role === 'admin' || user?.role === 'superadmin') && (
             <NavLink
               to="/admin"
               className={({ isActive }) =>
                 clsx(
                   'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors mt-2',
                   isActive
                     ? 'bg-primary-50 text-primary-700'
                     : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                 )
               }
             >
              <ChevronRight size={18} />
              Panel Admin
            </NavLink>
          )}
        </nav>

        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-700 font-semibold text-sm">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user?.full_name || user?.username}</p>
              <p className="truncate text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-red-600 transition-colors">
            <LogOut size={16} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
