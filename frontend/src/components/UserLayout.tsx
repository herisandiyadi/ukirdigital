import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { performLogout } from '@/services/logout'
import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { MobileDrawer, MobileHeader } from './MobileDrawer'
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
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    await performLogout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-serat">
      {/* Sidebar: tetap di desktop (md+), drawer di mobile */}
      <aside className="hidden md:flex w-60 flex-col bg-white border-r border-kayu">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-kayu">
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
                    : 'text-ampas hover:bg-kayu/30 hover:text-arang'
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
                     : 'text-ampas hover:bg-kayu/30 hover:text-arang'
                 )
               }
             >
              <ChevronRight size={18} />
              Panel Admin
            </NavLink>
          )}
        </nav>

        <div className="border-t border-kayu p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-700 font-semibold text-sm">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-arang">{user?.full_name || user?.username}</p>
              <p className="truncate text-xs text-ampas">{user?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ampas hover:bg-kayu/30 hover:text-status-gagal transition-colors">
            <LogOut size={16} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Drawer mobile: isi sidebar yang sama */}
      <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)}>
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5" onClick={() => setMenuOpen(false)}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-ampas hover:bg-kayu/30 hover:text-arang'
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
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-ampas hover:bg-kayu/30 hover:text-arang'
                )
              }
            >
              <ChevronRight size={18} />
              Panel Admin
            </NavLink>
          )}
        </nav>
        <div className="border-t border-kayu p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-700 font-semibold text-sm">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-arang">{user?.full_name || user?.username}</p>
              <p className="truncate text-xs text-ampas">{user?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex w-full min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm text-ampas hover:bg-kayu/30 hover:text-status-gagal transition-colors">
            <LogOut size={16} />
            Keluar
          </button>
        </div>
      </MobileDrawer>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader title="ukir digital" onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
