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
        <h1 className="text-2xl font-bold text-arang">Account Settings</h1>
        <p className="text-ampas text-sm mt-1">Manage your profile, password, and plan limits</p>
      </div>

        {/* Tabs */}
        <div className="flex border-b border-kayu">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-kuningan text-kuningan'
                  : 'border-transparent text-ampas hover:text-ampas'
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
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-kuningan to-kuningan
                              flex items-center justify-center text-white text-2xl font-bold select-none">
                {(user?.username?.[0] ?? '?').toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-arang">{user?.username}</p>
                <p className="text-sm text-ampas">{user?.email}</p>
                <span className={`badge mt-1 ${user?.role === 'admin' || user?.role === 'superadmin' ? 'badge-gagal' : 'badge-aksen'}`}>
                  {user?.role}
                </span>
              </div>
            </div>

            {/* Verified badge */}
            {meData?.is_verified && (
              <div className="flex items-center gap-2 text-sm text-status-sukses bg-status-sukses
                              border border-status-sukses rounded-lg px-3 py-2">
                <CheckCircleIcon className="w-4 h-4" />
                Email verified
              </div>
            )}

            <form
              onSubmit={profileForm.handleSubmit(d => updateProfile.mutate(d))}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-ampas mb-1">Full Name</label>
                <input
                  {...profileForm.register('full_name')}
                  className="input w-full"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ampas mb-1">Email</label>
                <input
                  {...profileForm.register('email', {
                    required: 'Email is required',
                    pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
                  })}
                  type="email"
                  className="input w-full"
                />
                {profileForm.formState.errors.email && (
                  <p className="text-status-gagal text-xs mt-1">
                    {profileForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-ampas mb-1">Username</label>
                <input
                  value={user?.username ?? ''}
                  disabled
                  className="input w-full bg-serat text-ampas/70 cursor-not-allowed"
                />
                <p className="text-xs text-ampas/70 mt-1">Username cannot be changed</p>
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
              <h2 className="text-lg font-semibold text-arang">Change Password</h2>
              <p className="text-sm text-ampas">Use a strong password with at least 8 characters.</p>
            </div>

            <form onSubmit={pwForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ampas mb-1">
                  Current Password
                </label>
                <input
                  {...pwForm.register('current_password', { required: 'Required' })}
                  type="password"
                  className="input w-full"
                  autoComplete="current-password"
                />
                {pwForm.formState.errors.current_password && (
                  <p className="text-status-gagal text-xs mt-1">
                    {pwForm.formState.errors.current_password.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-ampas mb-1">
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
                  <p className="text-status-gagal text-xs mt-1">
                    {pwForm.formState.errors.new_password.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-ampas mb-1">
                  Confirm New Password
                </label>
                <input
                  {...pwForm.register('confirm_password', { required: 'Required' })}
                  type="password"
                  className="input w-full"
                  autoComplete="new-password"
                />
                {pwForm.formState.errors.confirm_password && (
                  <p className="text-status-gagal text-xs mt-1">
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
            <div className="pt-4 border-t border-kayu">
              <h3 className="text-sm font-medium text-ampas mb-3">Account Status</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="bg-serat rounded-lg p-3">
                  <p className="text-ampas">Account Status</p>
                  <p className="font-semibold text-status-sukses mt-0.5">Active</p>
                </div>
                <div className="bg-serat rounded-lg p-3">
                  <p className="text-ampas">Last Login</p>
                  <p className="font-semibold text-arang mt-0.5">
                    {meData?.last_login
                      ? new Date(meData.last_login).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
                <div className="bg-serat rounded-lg p-3">
                  <p className="text-ampas">Email Verified</p>
                  <p className={`font-semibold mt-0.5 ${meData?.is_verified ? 'text-status-sukses' : 'text-kuningan'}`}>
                    {meData?.is_verified ? 'Yes' : 'Pending'}
                  </p>
                </div>
                <div className="bg-serat rounded-lg p-3">
                  <p className="text-ampas">Member Since</p>
                  <p className="font-semibold text-arang mt-0.5">
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
            <h2 className="text-lg font-semibold text-arang">Plan & Limits</h2>
            <p className="text-sm text-ampas">Your current usage limits assigned by the administrator.</p>
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
              <div className="flex items-center justify-between py-3 border-b border-kayu">
                <span className="text-sm text-ampas font-medium">Output Formats</span>
                <div className="flex gap-2">
                  {lim.allowed_formats?.map((f: string) => (
                    <span key={f} className="badge badge-aksen uppercase">{f}</span>
                  ))}
                </div>
              </div>
              {/* AI Analysis */}
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-ampas font-medium">AI Image Analysis</span>
                <span className={`badge ${lim.use_ai_analysis ? 'badge-sukses' : 'badge-netral'}`}>
                  {lim.use_ai_analysis ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-ampas/70 text-sm">No limit data available.</p>
          )}

          <div className="bg-kuningan border border-kuningan rounded-lg p-4 text-sm text-kuningan">
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
    <div className="flex items-center justify-between py-3 border-b border-kayu">
      <span className="text-sm text-ampas font-medium">{label}</span>
      <span className="font-semibold text-arang">
        {value.toLocaleString()} <span className="text-ampas/70 font-normal text-xs">{unit}</span>
      </span>
    </div>
  )
}
