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
        <h1 className="text-2xl font-bold text-arang">
          Selamat datang, {user?.full_name || user?.username}! 👋
        </h1>
        <p className="text-ampas mt-1">Mulai konversi gambar PNG/JPG ke format 3D.</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary-100 flex items-center justify-center">
            <Zap size={24} className="text-primary-600" />
          </div>
          <div>
            <p className="text-sm text-ampas">Konversi hari ini</p>
            <p className="text-2xl font-bold text-arang">
              {limits?.used_today ?? '—'} <span className="text-sm font-normal text-ampas/70">/ {limits?.max_per_day ?? '—'}</span>
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-status-sukses flex items-center justify-center">
            <TrendingUp size={24} className="text-status-sukses" />
          </div>
          <div>
            <p className="text-sm text-ampas">Bulan ini</p>
            <p className="text-2xl font-bold text-arang">
              {limits?.used_this_month ?? '—'} <span className="text-sm font-normal text-ampas/70">/ {limits?.max_per_month ?? '—'}</span>
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-kuningan flex items-center justify-center">
            <History size={24} className="text-kuningan" />
          </div>
          <div>
            <p className="text-sm text-ampas">Format tersedia</p>
            <p className="text-lg font-bold text-arang uppercase">
              {limits?.allowed_formats?.join(', ') ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Daily limit bar */}
      {limits && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ampas">Kuota harian</span>
            <span className={`text-sm font-semibold ${limits.daily_limit_hit ? 'text-status-gagal' : 'text-ampas'}`}>
              {limits.used_today} / {limits.max_per_day}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-kayu/30">
            <div
              className={`h-2.5 rounded-full transition-all ${usagePercent >= 100 ? 'bg-status-gagal' : usagePercent >= 80 ? 'bg-kuningan' : 'bg-primary-500'}`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
          {limits.daily_limit_hit && (
            <p className="text-xs text-status-gagal mt-2">⚠️ Kuota harian habis. Reset besok pukul 00:00 UTC.</p>
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
            <h2 className="font-semibold text-arang">Konversi Terakhir</h2>
            <Link to="/history" className="text-sm text-primary-600 hover:underline">Lihat semua</Link>
          </div>
          <div className="divide-y divide-kayu">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-arang truncate">{job.original_filename}</p>
                  <p className="text-xs text-ampas/70 mt-0.5">
                    {new Date(job.created_at).toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {job.output_files && (
                    <span className="text-xs text-ampas uppercase">
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
