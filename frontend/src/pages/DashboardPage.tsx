import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { fetchLimits } from '@/services/jobService'
import { listJobs } from '@/services/jobService'
import type { LimitsStatus, ConversionJob } from '@/types'
import { StatusBadge } from '@/components/StatusBadge'
import { Upload, History, Zap, TrendingUp } from 'lucide-react'

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const [limits, setLimits] = useState<LimitsStatus | null>(null)
  const [recentJobs, setRecentJobs] = useState<ConversionJob[]>([])

  useEffect(() => {
    fetchLimits().then(setLimits).catch(() => {})
    listJobs({ limit: 5 }).then((r) => setRecentJobs(r.items)).catch(() => {})
  }, [])

  const usagePercent = limits ? Math.round((limits.used_today / limits.max_per_day) * 100) : 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Selamat datang, {user?.full_name || user?.username}! 👋
        </h1>
        <p className="text-gray-500 mt-1">Mulai konversi gambar PNG/JPG ke format 3D.</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary-100 flex items-center justify-center">
            <Zap size={24} className="text-primary-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Konversi hari ini</p>
            <p className="text-2xl font-bold text-gray-900">
              {limits?.used_today ?? '—'} <span className="text-sm font-normal text-gray-400">/ {limits?.max_per_day ?? '—'}</span>
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
            <TrendingUp size={24} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Bulan ini</p>
            <p className="text-2xl font-bold text-gray-900">
              {limits?.used_this_month ?? '—'} <span className="text-sm font-normal text-gray-400">/ {limits?.max_per_month ?? '—'}</span>
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center">
            <History size={24} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Format tersedia</p>
            <p className="text-lg font-bold text-gray-900 uppercase">
              {limits?.allowed_formats?.join(', ') ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Daily limit bar */}
      {limits && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Kuota harian</span>
            <span className={`text-sm font-semibold ${limits.daily_limit_hit ? 'text-red-600' : 'text-gray-700'}`}>
              {limits.used_today} / {limits.max_per_day}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-gray-100">
            <div
              className={`h-2.5 rounded-full transition-all ${usagePercent >= 100 ? 'bg-red-500' : usagePercent >= 80 ? 'bg-yellow-500' : 'bg-primary-500'}`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
          {limits.daily_limit_hit && (
            <p className="text-xs text-red-600 mt-2">⚠️ Kuota harian habis. Reset besok pukul 00:00 UTC.</p>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="flex gap-4 mb-10">
        <Link to="/convert" className={`btn-primary gap-2 ${limits?.daily_limit_hit ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload size={18} />
          Konversi Baru
        </Link>
        <Link to="/history" className="btn-secondary gap-2">
          <History size={18} />
          Lihat Riwayat
        </Link>
      </div>

      {/* Recent jobs */}
      {recentJobs.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Konversi Terakhir</h2>
            <Link to="/history" className="text-sm text-primary-600 hover:underline">Lihat semua</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{job.original_filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(job.created_at).toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {job.output_files && (
                    <span className="text-xs text-gray-500 uppercase">
                      {Object.keys(job.output_files).join(', ')}
                    </span>
                  )}
                  <StatusBadge status={job.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
