import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import UserLayout from './UserLayout'
import AdminLayout from './AdminLayout'

function FullPageSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
    </div>
  )
}

export function RequireAuth() {
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.ready)
  // Tunggu pemulihan sesi dari cookie sebelum memutuskan redirect,
  // supaya reload tidak melempar user ke /login (BUG-S04).
  if (!ready) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return <UserLayout><Outlet /></UserLayout>
}

export function RequireAdmin() {
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.ready)
  if (!ready) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin' && user.role !== 'superadmin') return <Navigate to="/dashboard" replace />
  return <AdminLayout><Outlet /></AdminLayout>
}

export function RequireSuperadmin() {
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.ready)
  if (!ready) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'superadmin') return <Navigate to="/admin" replace />
  return <AdminLayout><Outlet /></AdminLayout>
}
