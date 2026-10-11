import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
import { PhoneInput } from '../components/PhoneInput'
import {
  UserCircleIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileForm {
  full_name: string
  email: string
  phone_number?: string
}

interface PasswordForm {
  current_password: string
  new_password: string
  confirm_password: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fetchMe = async () => {
  const { data } = await api.get('/users/me')
  return data
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const queryClient       = useQueryClient()
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'limits'>('profile')

  // ── Profile form ──────────────────────────────────────────────────────────
  const { data: meData } = useQuery({ queryKey: ['me'], queryFn: fetchMe })

  const [phoneError, setPhoneError] = useState('')
  const profileForm = useForm<ProfileForm>({
    values: {
      full_name: meData?.full_name ?? user?.full_name ?? '',
      email:     meData?.email     ?? user?.email     ?? '',
      phone_number: meData?.phone_number ?? user?.phone_number ?? '',
    },
  })

  const updateProfile = useMutation({
    mutationFn: (data: ProfileForm) => api.patch('/users/me', data).then(r => r.data),
    onSuccess: updated => {
      setUser(updated)
      queryClient.invalidateQueries({ queryKey: ['me'] })
      toast.success('Profile updated!')
    },
    onError: () => toast.error('Failed to update profile'),
  })

  // ── Password form ─────────────────────────────────────────────────────────
  const pwForm = useForm<PasswordForm>()

  const changePassword = useMutation({
    mutationFn: (data: PasswordForm) =>
      api.post('/auth/change-password', data).then(r => r.data),
    onSuccess: () => {
      toast.success('Password changed!')
      pwForm.reset()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? 'Failed to change password')
    },
  })

  const onPasswordSubmit = (data: PasswordForm) => {
    if (data.new_password !== data.confirm_password) {
      pwForm.setError('confirm_password', { message: 'Passwords do not match' })
      return
    }
    changePassword.mutate(data)
  }

  const lim = meData?.limits

  const tabs = [
    { id: 'profile',  label: 'Profile',  Icon: UserCircleIcon },
    { id: 'security', label: 'Security', Icon: LockClosedIcon },
    { id: 'limits',   label: 'My Limits', Icon: ShieldCheckIcon },
  ] as const

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your profile, password, and plan limits</p>
      </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Profile Tab ──────────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div className="card space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600
                              flex items-center justify-center text-white text-2xl font-bold select-none">
                {(user?.username?.[0] ?? '?').toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{user?.username}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
                <span className={`badge mt-1 ${user?.role === 'admin' ? 'badge-red' : 'badge-indigo'}`}>
                  {user?.role}
                </span>
              </div>
            </div>

            {/* Verified badge */}
            {meData?.is_verified && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50
                              border border-green-200 rounded-lg px-3 py-2">
                <CheckCircleIcon className="w-4 h-4" />
                Email verified
              </div>
            )}

            <form
              onSubmit={profileForm.handleSubmit(d => updateProfile.mutate(d))}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  {...profileForm.register('full_name')}
                  className="input w-full"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  {...profileForm.register('email', {
                    required: 'Email is required',
                    pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
                  })}
                  type="email"
                  className="input w-full"
                />
                {profileForm.formState.errors.email && (
                  <p className="text-red-500 text-xs mt-1">
                    {profileForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  value={user?.username ?? ''}
                  disabled
                  className="input w-full bg-gray-50 text-gray-400 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">Username cannot be changed</p>
              </div>
              <PhoneInput
                value={profileForm.watch('phone_number') || ''}
                onChange={(phone) => {
                  profileForm.setValue('phone_number', phone)
                  setPhoneError('')
                }}
                error={phoneError}
              />
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={updateProfile.isPending}
                  className="btn-primary"
                >
                  {updateProfile.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Security Tab ─────────────────────────────────────────────── */}
        {activeTab === 'security' && (
          <div className="card space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
              <p className="text-sm text-gray-500">Use a strong password with at least 8 characters.</p>
            </div>

            <form onSubmit={pwForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Password
                </label>
                <input
                  {...pwForm.register('current_password', { required: 'Required' })}
                  type="password"
                  className="input w-full"
                  autoComplete="current-password"
                />
                {pwForm.formState.errors.current_password && (
                  <p className="text-red-500 text-xs mt-1">
                    {pwForm.formState.errors.current_password.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  {...pwForm.register('new_password', {
                    required: 'Required',
                    minLength: { value: 8, message: 'Minimum 8 characters' },
                  })}
                  type="password"
                  className="input w-full"
                  autoComplete="new-password"
                />
                {pwForm.formState.errors.new_password && (
                  <p className="text-red-500 text-xs mt-1">
                    {pwForm.formState.errors.new_password.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  {...pwForm.register('confirm_password', { required: 'Required' })}
                  type="password"
                  className="input w-full"
                  autoComplete="new-password"
                />
                {pwForm.formState.errors.confirm_password && (
                  <p className="text-red-500 text-xs mt-1">
                    {pwForm.formState.errors.confirm_password.message}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={changePassword.isPending}
                  className="btn-primary"
                >
                  {changePassword.isPending ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>

            {/* Session info */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Account Status</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500">Account Status</p>
                  <p className="font-semibold text-green-600 mt-0.5">Active</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500">Last Login</p>
                  <p className="font-semibold text-gray-900 mt-0.5">
                    {meData?.last_login
                      ? new Date(meData.last_login).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500">Email Verified</p>
                  <p className={`font-semibold mt-0.5 ${meData?.is_verified ? 'text-green-600' : 'text-yellow-600'}`}>
                    {meData?.is_verified ? 'Yes' : 'Pending'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500">Member Since</p>
                  <p className="font-semibold text-gray-900 mt-0.5">
                    {meData?.created_at
                      ? new Date(meData.created_at).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* ── Limits Tab ───────────────────────────────────────────────── */}
      {activeTab === 'limits' && (
        <div className="card space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Plan & Limits</h2>
            <p className="text-sm text-gray-500">Your current usage limits assigned by the administrator.</p>
          </div>

          {lim ? (
            <div className="space-y-4">
              {/* Daily limit */}
              <LimitRow
                label="Daily Conversions"
                value={lim.max_conversions_per_day}
                unit="/ day"
              />
              {/* Monthly limit */}
              <LimitRow
                label="Monthly Conversions"
                value={lim.max_conversions_per_month}
                unit="/ month"
              />
              {/* File size */}
              <LimitRow
                label="Max File Size"
                value={lim.max_file_size_mb}
                unit="MB"
              />
              {/* Formats */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-600 font-medium">Output Formats</span>
                <div className="flex gap-2">
                  {lim.allowed_formats?.map((f: string) => (
                    <span key={f} className="badge badge-indigo uppercase">{f}</span>
                  ))}
                </div>
              </div>
              {/* AI Analysis */}
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-gray-600 font-medium">AI Image Analysis</span>
                <span className={`badge ${lim.use_ai_analysis ? 'badge-green' : 'badge-gray'}`}>
                  {lim.use_ai_analysis ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No limit data available.</p>
          )}

          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-700">
            To upgrade your limits, contact an administrator.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function LimitRow({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100">
      <span className="text-sm text-gray-600 font-medium">{label}</span>
      <span className="font-semibold text-gray-900">
        {value.toLocaleString()} <span className="text-gray-400 font-normal text-xs">{unit}</span>
      </span>
    </div>
  )
}
