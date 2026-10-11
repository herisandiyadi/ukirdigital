import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import type { LoginResponse } from '@/types'

interface FormData { email: string; password: string }

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>()
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await api.post<LoginResponse>('/auth/login', data)
      setAuth(res.data.user, res.data.access_token)
      navigate(res.data.user.role === 'admin' ? '/admin' : '/dashboard')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Login gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            {/* Logo utama: ukirdigital-logo.png di frontend/public */}
            <img
              src="/ukirdigital-logo.png"
              alt="ukir digital logo"
              className="h-16 rounded-xl shadow-lg"
            />
          </div>
          <h1 className="text-2xl font-bold text-white">Masuk ke ukir digital</h1>
          <p className="text-gray-400 mt-1 text-sm">Convert gambar ke relief 3D siap CNC & STL</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                {...register('email', { required: 'Email wajib diisi' })}
                type="email"
                className="input"
                placeholder="email@contoh.com"
              />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Password</label>
              <input
                {...register('password', { required: 'Password wajib diisi' })}
                type="password"
                className="input"
                placeholder="••••••••"
              />
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>
            <div className="flex items-center justify-end">
              <Link to="/forgot-password" className="text-xs text-primary-600 hover:underline">
                Lupa password?
              </Link>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
          {/* <p className="mt-4 text-center text-sm text-gray-500">
            Belum punya akun?{' '}
            <Link to="/register" className="text-primary-600 font-medium hover:underline">Daftar gratis</Link>
          </p> */}
        </div>
      </div>
    </div>
  )
}
