import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { performLogout } from '@/services/logout'
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

// FEAT-SA01: menu khusus superadmin (tampilan saja; backend penegak utama).
const SUPERADMIN_NAV = [
  { to: '/admin/admins', icon: Users, label: 'Kelola Admin', end: false },
]

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen overflow-hidden bg-serat">
      <aside className="flex w-60 flex-col bg-white border-r border-kayu">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-kayu">
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
                    : 'text-ampas hover:bg-kayu/30 hover:text-arang'
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          {user?.role === 'superadmin' && SUPERADMIN_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors mt-2',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-ampas hover:bg-kayu/30 hover:text-arang'
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-kayu p-3 space-y-1">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ampas hover:bg-kayu/30 hover:text-arang transition-colors"
            >
            <ArrowLeft size={16} />
            Kembali ke App
          </button>
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-700 font-semibold text-sm">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
               <p className="truncate text-sm font-medium text-arang">{user?.username}</p>
               <p className="truncate text-xs text-ampas">{user?.role === 'superadmin' ? 'Superadmin' : 'Administrator'}</p>
            </div>
          </div>
            <button
              onClick={async () => { await performLogout(); navigate('/login') }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ampas hover:bg-kayu/30 hover:text-status-gagal transition-colors"
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
