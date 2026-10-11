import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'

/**
 * FEAT-SA01 — Kelola Admin (khusus superadmin).
 * Menampilkan admin & superadmin, dan mengubah role lewat PUT /admin/users/{id}.
 * Backend yang menegakkan aturan; halaman ini hanya menampilkan.
 */

interface AdminRow {
  id: string
  email: string
  username: string
  role: 'superadmin' | 'admin' | 'user'
  is_active: boolean
}

const fetchAdmins = async (): Promise<AdminRow[]> => {
  const { data } = await api.get('/admin/users', { params: { limit: 200 } })
  const rows: AdminRow[] = Array.isArray(data) ? data : data.items ?? []
  return rows.filter((u) => u.role === 'admin' || u.role === 'superadmin')
}

export default function AdminsPage() {
  const me = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [error, setError] = useState('')

  const { data: admins = [], isLoading } = useQuery({ queryKey: ['admins'], queryFn: fetchAdmins })

  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'admin' | 'user' }) =>
      api.put(`/admin/users/${id}`, { role }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Role diperbarui')
      setError('')
      qc.invalidateQueries({ queryKey: ['admins'] })
    },
    onError: (e: any) => setError(e?.response?.data?.detail || 'Gagal mengubah role'),
  })

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Kelola Admin</h1>
      <p className="text-sm text-gray-500 mb-6">
        Hanya superadmin yang bisa menaikkan atau menurunkan admin. Superadmin lain tidak bisa diubah.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-gray-500">Memuat…</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isSelf = a.id === me?.id
                const isSuper = a.role === 'superadmin'
                return (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="py-2 pr-4">{a.username}{isSelf && ' (Anda)'}</td>
                    <td className="py-2 pr-4">{a.email}</td>
                    <td className="py-2 pr-4">
                      <span className={`badge ${isSuper ? 'badge-red' : 'badge-indigo'}`}>{a.role}</span>
                    </td>
                    <td className="py-2 pr-4">
                      {isSuper || isSelf ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <button
                          className="btn-secondary text-xs"
                          disabled={setRole.isPending}
                          onClick={() => setRole.mutate({ id: a.id, role: 'user' })}
                        >
                          Turunkan ke user
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {admins.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-gray-400">Belum ada admin.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
