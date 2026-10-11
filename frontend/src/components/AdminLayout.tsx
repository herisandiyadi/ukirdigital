import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { performLogout } from '@/services/logout'
import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import {
  LayoutDashboard, Users, Sliders, Settings, Activity, BarChart2,
  LogOut, ArrowLeft,
} from 'lucide-react'
import { MobileDrawer, MobileHeader } from './MobileDrawer'

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

const linkCls = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive ? 'bg-primary-50 text-primary-700' : 'text-ampas hover:bg-kayu/30 hover:text-arang'
  )

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  // Isi sidebar dipakai dua kali: sebagai sidebar desktop dan sebagai drawer mobile.
  const sidebarBody = (onNavigate?: () => void) => (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5" onClick={onNavigate}>
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={linkCls}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {user?.role === 'superadmin' && SUPERADMIN_NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) => clsx(linkCls({ isActive }), 'mt-2')}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-kayu p-3 space-y-1">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex w-full min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm text-ampas hover:bg-kayu/30 hover:text-arang transition-colors"
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
          className="flex w-full min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm text-ampas hover:bg-kayu/30 hover:text-status-gagal transition-colors"
        >
          <LogOut size={16} />
          Keluar
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-serat">
      {/* Sidebar desktop (md ke atas) */}
      <aside className="hidden md:flex w-60 flex-col bg-white border-r border-kayu">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-kayu">
          <img src="/ukirdigital-logo.png" alt="ukir digital admin logo" className="h-9 rounded-lg" />
        </div>
        {sidebarBody()}
      </aside>

      {/* Drawer mobile */}
      <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)}>
        {sidebarBody(() => setMenuOpen(false))}
      </MobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader title="Panel Admin" onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
