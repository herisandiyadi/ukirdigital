import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * Dipakai lewat link WhatsApp/email: /reset-password?token=...
 * Backend: POST /api/v1/auth/reset-password { token, new_password }
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('Token reset tidak ditemukan di link.')
      return
    }
    if (password.length < 8) {
      setError('Password minimal 8 karakter.')
      return
    }
    if (password !== confirm) {
      setError('Konfirmasi password tidak sama.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, new_password: password })
      toast.success('Password berhasil direset.')
      navigate('/login')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Reset password gagal. Link mungkin sudah kedaluwarsa.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Reset Password</h2>
          <p className="text-gray-500 text-sm text-center mb-6">Masukkan password baru untuk akun Anda.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">Password Baru</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 karakter"
                required
              />
            </div>
            <div>
              <label className="label">Ulangi Password Baru</label>
              <input
                type="password"
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Ulangi password"
                required
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Menyimpan...' : 'Simpan Password Baru'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            Ingat password Anda?{' '}
            <Link to="/login" className="text-primary-600 font-medium hover:underline">Masuk</Link>
          </p>
        </div>
      </div>
    </div>
  )
}