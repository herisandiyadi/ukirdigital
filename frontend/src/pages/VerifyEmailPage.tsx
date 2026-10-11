import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '@/services/api'
import toast from 'react-hot-toast'

/**
 * Dipakai lewat link WhatsApp/email: /verify-email?token=...
 * Backend: POST /api/v1/auth/verify-email?token=...
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('')
  // React 18 StrictMode menjalankan effect dua kali saat dev; token sekali pakai
  // bisa terbakar di percobaan pertama, jadi hasil pertama dipertahankan.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    if (!token) {
      setState('error')
      setMessage('Token verifikasi tidak ditemukan di link.')
      return
    }
    api
      .post('/auth/verify-email', null, { params: { token } })
      .then((res) => {
        setState('ok')
        setMessage(res.data?.message || 'Email berhasil diverifikasi!')
        toast.success('Akun Anda sudah aktif.')
        setTimeout(() => navigate('/login'), 2500)
      })
      .catch((e) => {
        setState('error')
        setMessage(e?.response?.data?.detail || 'Verifikasi gagal. Link mungkin sudah kedaluwarsa.')
      })
  }, [token, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="card text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 mb-6">
            <span className="text-4xl">{state === 'ok' ? '✅' : state === 'error' ? '⚠️' : '⏳'}</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {state === 'ok' ? 'Verifikasi Berhasil' : state === 'error' ? 'Verifikasi Gagal' : 'Memverifikasi...'}
          </h2>
          <p className="text-gray-600 mb-6">{state === 'loading' ? 'Mohon tunggu sebentar.' : message}</p>

          {state === 'ok' && (
            <p className="text-sm text-gray-500">Mengalihkan ke halaman masuk...</p>
          )}
          {state === 'error' && (
            <Link to="/login" className="btn-primary inline-block w-full py-2.5">
              Kembali ke Masuk
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}