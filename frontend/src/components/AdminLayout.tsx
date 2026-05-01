import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import clsx from 'clsx'
import { ReactNode } from 'react'
import {
  LayoutDashboard, Users, Sliders, Settings, Activity, BarChart2,
  LogOut, ArrowLeft,
} from 'lucide-react'

const NAV = [
  { to: '/admin',              icon: LayoutDashboard, label: 'Dashboard Admin', end: true },
  { to: '/admin/users',        icon: Users,           label: 'Manajemen User' },
  { to: '/admin/limits',       icon: Sliders,         label: 'Limit Default' },
  { to: '/admin/settings',     icon: Settings,        label: 'System Settings' },
  { to: '/admin/logs',         icon: Activity,        label: 'Log Aktivitas' },
  { to: '/admin/stats',        icon: BarChart2,       label: 'Statistik & Laporan' },
]

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="flex w-60 flex-col bg-white border-r border-gray-200">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-100">
          <img
            src="/ukirdigital-logo.png"
            alt="ukir digital admin logo"
            className="h-9 rounded-lg"
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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
        </nav>

        <div className="border-t border-gray-100 p-3 space-y-1">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
            <ArrowLeft size={16} />
            Kembali ke App
          </button>
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-700 font-semibold text-sm">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
               <p className="truncate text-sm font-medium text-gray-900">{user?.username}</p>
               <p className="truncate text-xs text-gray-500">Administrator</p>
            </div>
          </div>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-red-600 transition-colors"
            >
            <LogOut size={16} />
            Keluar
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
