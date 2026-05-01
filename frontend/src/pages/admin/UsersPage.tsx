import { useState, useEffect, useCallback } from 'react'
import {
  fetchAdminUsers, updateAdminUser, updateUserLimits,
  suspendUser, deleteAdminUser, createAdminUser, exportUsersCSV,
} from '@/services/adminService'
import type { User, UserLimit } from '@/types'
import toast from 'react-hot-toast'
import { PhoneInput } from '@/components/PhoneInput'
import { Search, Plus, Edit2, Sliders, UserX, Trash2, X, Download } from 'lucide-react'
import clsx from 'clsx'

const PRESETS: Record<string, Partial<UserLimit>> = {
  gratis: { max_conversions_per_day: 5, max_conversions_per_month: 30, max_file_size_mb: 5, max_output_formats: 1, allowed_formats: ['stl'], use_ai_analysis: false },
  basic:  { max_conversions_per_day: 20, max_conversions_per_month: 200, max_file_size_mb: 20, max_output_formats: 3, allowed_formats: ['stl','svg','dxf'], use_ai_analysis: false },
  pro:    { max_conversions_per_day: 100, max_conversions_per_month: 1000, max_file_size_mb: 50, max_output_formats: 3, allowed_formats: ['stl','svg','dxf'], use_ai_analysis: true },
}

export default function UsersPage() {
  const [users, setUsers]   = useState<User[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const [editUser, setEditUser]     = useState<User | null>(null)
  const [limitUser, setLimitUser]   = useState<User | null>(null)
  const [limitTab, setLimitTab]     = useState<'limit' | 'feature'>('limit')
  const [limitForm, setLimitForm]   = useState<Partial<UserLimit>>({})
  const [editForm, setEditForm]     = useState<Partial<User>>({})
  const [phoneError, setPhoneError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', username: '', password: '', full_name: '', phone_number: '' })
  const [createPhoneError, setCreatePhoneError] = useState('')

  const PER_PAGE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchAdminUsers({ page, limit: PER_PAGE, search: search || undefined, filter: filter || undefined })
      setUsers(r.items)
      setTotal(r.total)
    } catch {
      toast.error('Gagal memuat user')
    } finally {
      setLoading(false)
    }
  }, [page, search, filter])

  useEffect(() => { load() }, [load])

  const handleSuspend = async (u: User) => {
    if (!confirm(`Suspend user ${u.username}?`)) return
    try { await suspendUser(u.id); toast.success('User disuspend'); load() }
    catch { toast.error('Gagal suspend') }
  }

  const handleDelete = async (u: User) => {
    if (!confirm(`Hapus permanen user ${u.username}?`)) return
    try { await deleteAdminUser(u.id); toast.success('User dihapus'); load() }
    catch { toast.error('Gagal hapus') }
  }

  const handleEditSave = async () => {
    if (!editUser) return
    try { await updateAdminUser(editUser.id, editForm); toast.success('User diperbarui'); setEditUser(null); load() }
    catch { toast.error('Gagal update') }
  }

  const handleLimitSave = async () => {
    if (!limitUser) return
    try { await updateUserLimits(limitUser.id, limitForm); toast.success('Limit diperbarui'); setLimitUser(null); load() }
    catch { toast.error('Gagal update limit') }
  }

  const applyPreset = (key: string) => setLimitForm({ ...limitForm, ...PRESETS[key] })

  const handleCreate = async () => {
    try { await createAdminUser(createForm); toast.success('User dibuat'); setShowCreate(false); load() }
    catch (e: any) { toast.error(e?.response?.data?.detail || 'Gagal buat user') }
  }

  const handleExport = async () => {
    try {
      const blob = await exportUsersCSV()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'users.csv'; a.click()
    } catch { toast.error('Gagal export') }
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Manajemen User</h1>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-secondary gap-1"><Download size={15} />Export CSV</button>
          <button onClick={() => setShowCreate(true)} className="btn-primary gap-1"><Plus size={15} />Tambah User</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Cari nama/email/username..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1) }} className="input w-40">
          {['', 'active', 'inactive', 'admin'].map((f) => (
            <option key={f} value={f}>{f ? f.charAt(0).toUpperCase() + f.slice(1) : 'Semua'}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['User', 'Username', 'Role', 'Status', 'Konversi/Bulan', 'Terakhir Login', 'Aksi'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Memuat...</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm flex-shrink-0">
                      {u.username[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{u.full_name || u.username}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={clsx('badge', u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700')}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={clsx('badge', u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                    {u.is_active ? (u.is_verified ? 'Aktif' : 'Belum Verifikasi') : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">—</td>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {u.last_login ? new Date(u.last_login).toLocaleDateString('id-ID') : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditUser(u); setEditForm({ full_name: u.full_name || '', username: u.username, email: u.email, role: u.role, is_active: u.is_active }) }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Edit"><Edit2 size={14} /></button>
                    <button onClick={() => { setLimitUser(u); setLimitForm(u.limits ?? {}); setLimitTab('limit') }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-indigo-600" title="Atur Limit"><Sliders size={14} /></button>
                    <button onClick={() => handleSuspend(u)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-orange-600" title="Suspend"><UserX size={14} /></button>
                    <button onClick={() => handleDelete(u)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600" title="Hapus"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-gray-500">Total: {total} user</span>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => setPage(p)} className={clsx('h-8 w-8 rounded-lg text-xs font-medium', p === page ? 'bg-primary-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50')}>{p}</button>
            ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Edit User: {editUser.username}</h2>
              <button onClick={() => setEditUser(null)}><X size={18} /></button>
            </div>
            {[['full_name','Nama Lengkap','text'],['username','Username','text'],['email','Email','email']].map(([k,l,t]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input type={t} className="input" value={(editForm as any)[k] ?? ''} onChange={(e) => setEditForm({ ...editForm, [k]: e.target.value })} />
              </div>
            ))}
            <PhoneInput
              value={(editForm.phone_number as string) || ''}
              onChange={(phone) => {
                setEditForm({ ...editForm, phone_number: phone })
                setPhoneError('')
              }}
              error={phoneError}
            />
            <div>
              <label className="label">Role</label>
              <select className="input" value={editForm.role ?? 'user'} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as any })}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={!!editForm.is_active} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} />
              <label htmlFor="is_active" className="text-sm text-gray-700">Akun Aktif</label>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleEditSave} className="btn-primary flex-1">Simpan</button>
              <button onClick={() => setEditUser(null)} className="btn-secondary flex-1">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Limit Modal */}
      {limitUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">Atur Limit: {limitUser.username}</h2>
              <button onClick={() => setLimitUser(null)}><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b mb-4">
              {(['limit','feature'] as const).map((t) => (
                <button key={t} onClick={() => setLimitTab(t)} className={clsx('px-4 py-2 text-sm font-medium border-b-2 -mb-px', limitTab === t ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                  {t === 'limit' ? 'Limit Konversi' : 'Format & Fitur'}
                </button>
              ))}
            </div>

            {limitTab === 'limit' ? (
              <div className="space-y-4">
                <div>
                  <label className="label">Preset Paket</label>
                  <div className="flex gap-2">
                    {Object.keys(PRESETS).map((key) => (
                      <button key={key} onClick={() => applyPreset(key)} className="btn-secondary capitalize text-xs py-1">{key}</button>
                    ))}
                  </div>
                </div>
                {[
                  ['max_conversions_per_day', 'Max Konversi/Hari'],
                  ['max_conversions_per_month', 'Max Konversi/Bulan'],
                  ['max_file_size_mb', 'Max File (MB)'],
                ].map(([k, l]) => (
                  <div key={k}>
                    <label className="label">{l}</label>
                    <input type="number" className="input" value={(limitForm as any)[k] ?? ''} onChange={(e) => setLimitForm({ ...limitForm, [k]: +e.target.value })} />
                  </div>
                ))}
                <div>
                  <label className="label">Max Format Output Sekaligus</label>
                  <div className="flex gap-3">
                    {[1,2,3].map((n) => (
                      <label key={n} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="max_formats" checked={limitForm.max_output_formats === n} onChange={() => setLimitForm({ ...limitForm, max_output_formats: n })} />
                        <span className="text-sm">{n}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="label">Format Dibolehkan</label>
                  <div className="flex gap-3">
                    {['stl','svg','dxf'].map((f) => (
                      <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(limitForm.allowed_formats ?? []).includes(f)}
                          onChange={(e) => {
                            const cur = limitForm.allowed_formats ?? []
                            setLimitForm({ ...limitForm, allowed_formats: e.target.checked ? [...cur, f] : cur.filter((x) => x !== f) })
                          }}
                        />
                        <span className="text-sm uppercase font-medium">{f}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="ai_toggle" checked={!!limitForm.use_ai_analysis} onChange={(e) => setLimitForm({ ...limitForm, use_ai_analysis: e.target.checked })} />
                  <label htmlFor="ai_toggle" className="text-sm text-gray-700">Akses Analisis AI (Claude)</label>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 mt-4 border-t">
              <button onClick={handleLimitSave} className="btn-primary flex-1">Simpan</button>
              <button onClick={() => setLimitUser(null)} className="btn-secondary flex-1">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Tambah User Manual</h2>
              <button onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            {[['email','Email','email'],['username','Username','text'],['full_name','Nama Lengkap','text'],['password','Password','password']].map(([k,l,t]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input type={t} className="input" value={(createForm as any)[k]} onChange={(e) => setCreateForm({ ...createForm, [k]: e.target.value })} />
              </div>
            ))}
            <PhoneInput
              value={createForm.phone_number}
              onChange={(phone) => {
                setCreateForm({ ...createForm, phone_number: phone })
                setCreatePhoneError('')
              }}
              error={createPhoneError}
            />
            <div className="flex gap-3 pt-2">
              <button onClick={handleCreate} className="btn-primary flex-1">Buat User</button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
