import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '@/services/api'
import toast from 'react-hot-toast'

export default function VerificationPendingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [phoneNumber] = useState(location.state?.phone_number || '')
  const [loading, setLoading] = useState(false)

  const handleResendCode = async () => {
    setLoading(true)
    try {
      const email = location.state?.email
      if (!email) {
        toast.error('Email tidak ditemukan')
        return
      }

      await api.post('/auth/forgot-password', { email })
      toast.success('Link verifikasi telah dikirim ulang ke WhatsApp!')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Gagal mengirim ulang kode')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-kuningan p-4">
      <div className="w-full max-w-md">
        <div className="card text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-status-sukses mb-6">
            <span className="text-4xl">💬</span>
          </div>
          
          <h2 className="text-2xl font-bold text-arang mb-2">Verifikasi WhatsApp</h2>
          <p className="text-ampas mb-6">
            Kami telah mengirim link verifikasi ke WhatsApp Anda.
          </p>

          {phoneNumber && (
            <div className="bg-status-proses border border-status-proses p-4 rounded-lg mb-6">
              <p className="text-sm text-ampas">
                <strong>Nomor terdaftar:</strong> <br />
                {phoneNumber}
              </p>
              <p className="text-xs text-ampas mt-2">
                ✓ Link verifikasi berlaku 24 jam
              </p>
            </div>
          )}

          <div className="space-y-4">
            <p className="text-sm text-ampas">
              Belum menerima pesan?{' '}
              <button
                onClick={handleResendCode}
                disabled={loading}
                className="text-primary-600 hover:underline font-medium disabled:opacity-50"
              >
                {loading ? 'Mengirim...' : 'Kirim ulang'}
              </button>
            </p>

            <button
              onClick={() => navigate('/login')}
              className="btn-primary w-full py-2.5"
            >
              Lanjut ke Login
            </button>

            <p className="text-xs text-ampas">
              Butuh bantuan? Hubungi support kami
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
