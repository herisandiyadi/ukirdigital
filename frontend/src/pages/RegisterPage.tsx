import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { PhoneInput } from '@/components/PhoneInput'

interface FormData { 
  email: string
  username: string
  password: string
  full_name?: string
  phone_number: string
}

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<FormData>({
    defaultValues: {
      phone_number: ''
    }
  })
  const [loading, setLoading] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const navigate = useNavigate()
  const phoneValue = watch('phone_number')

  const validatePhone = (phone: string): boolean => {
    const phoneRegex = /^\+\d{10,20}$/
    if (!phoneRegex.test(phone)) {
      setPhoneError('Format: +62812345678 (min 10 digit)')
      return false
    }
    setPhoneError('')
    return true
  }

  const onSubmit = async (data: FormData) => {
    if (!validatePhone(data.phone_number)) {
      return
    }

    setLoading(true)
    try {
      await api.post('/v1/auth/register', data)
      toast.success('Registrasi berhasil! Cek WhatsApp untuk verifikasi.')
      navigate('/verification-pending', {
        state: {
          phone_number: data.phone_number,
          email: data.email
        }
      })
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Registrasi gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 mb-4">
            <span className="text-white font-bold text-2xl">P</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Buat Akun Baru</h1>
          <p className="text-gray-500 mt-1 text-sm">Gratis — 10 konversi/hari</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Nama Lengkap (opsional)</label>
              <input {...register('full_name')} className="input" placeholder="Nama Anda" />
            </div>
            <div>
              <label className="label">Username</label>
              <input
                {...register('username', { required: 'Username wajib diisi', minLength: { value: 3, message: 'Min 3 karakter' } })}
                className="input"
                placeholder="username_anda"
              />
              {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username.message}</p>}
            </div>
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
                {...register('password', { required: 'Password wajib diisi', minLength: { value: 8, message: 'Min 8 karakter' } })}
                type="password"
                className="input"
                placeholder="Min. 8 karakter"
              />
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>
            <PhoneInput
              value={phoneValue}
              onChange={(phone) => setValue('phone_number', phone)}
              error={phoneError}
            />
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Mendaftar...' : 'Daftar Sekarang'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500">
            Sudah punya akun?{' '}
            <Link to="/login" className="text-primary-600 font-medium hover:underline">Masuk</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
