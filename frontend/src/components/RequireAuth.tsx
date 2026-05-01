import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import UserLayout from './UserLayout'
import AdminLayout from './AdminLayout'

export function RequireAuth() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <UserLayout><Outlet /></UserLayout>
}

export function RequireAdmin() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <AdminLayout><Outlet /></AdminLayout>
}
