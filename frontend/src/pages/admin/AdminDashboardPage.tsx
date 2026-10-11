import { useEffect, useState, useRef } from 'react'
import { fetchOverview, fetchCharts, fetchAdminJobs } from '@/services/adminService'
import type { AdminStatsOverview, AdminChartsData } from '@/services/adminService'
import { StatusBadge } from '@/components/StatusBadge'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Users, Zap, CheckCircle, AlertTriangle, TrendingUp, XCircle, Clock } from 'lucide-react'

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444']

function StatCard({ icon: Icon, label, value, danger }: {
  icon: React.ElementType; label: string; value: string | number; danger?: boolean
}) {
  const isDanger = danger && Number(value) > 0
  return (
    <div className={`card flex items-center gap-4 ${isDanger ? 'border-status-gagal bg-status-gagal' : ''}`}>
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${isDanger ? 'bg-status-gagal' : 'bg-primary-100'}`}>
        <Icon size={22} className={isDanger ? 'text-status-gagal' : 'text-primary-600'} />
      </div>
      <div>
        <p className="text-sm text-ampas">{label}</p>
        <p className={`text-2xl font-bold ${isDanger ? 'text-status-gagal' : 'text-arang'}`}>{value}</p>
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<AdminStatsOverview | null>(null)
  const [charts, setCharts]     = useState<AdminChartsData | null>(null)
  const [activeJobs, setActiveJobs] = useState<any[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadOverview = () => fetchOverview().then(setOverview).catch(() => {})
  const loadCharts   = () => fetchCharts().then(setCharts).catch(() => {})
  const loadActive   = () =>
    fetchAdminJobs({ status: 'processing' })
      .then((r: any) => setActiveJobs(r.items ?? []))
      .catch(() => {})

  useEffect(() => {
    loadOverview(); loadCharts(); loadActive()
    pollRef.current = setInterval(() => { loadOverview(); loadActive() }, 15_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const stuckJobs = activeJobs.filter((j) =>
    j.created_at && Date.now() - new Date(j.created_at).getTime() > 5 * 60 * 1000
  )

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-arang">Dashboard Admin</h1>

      {stuckJobs.length > 0 && (
        <div className="rounded-xl bg-kuningan border border-kuningan p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-kuningan flex-shrink-0 mt-0.5" />
          <div className="text-sm text-kuningan">
            <strong>{stuckJobs.length} job</strong> stuck &gt;5 menit:{' '}
            {stuckJobs.map((j: any) => String(j.id).slice(0, 8)).join(', ')}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users}       label="Total Users"        value={overview?.total_users ?? '—'} />
        <StatCard icon={Users}       label="Active Users"       value={overview?.active_users ?? '—'} />
        <StatCard icon={Zap}         label="Jobs Today"         value={overview?.jobs_today ?? '—'} />
        <StatCard icon={TrendingUp}  label="Jobs This Month"    value={overview?.jobs_this_month ?? '—'} />
        <StatCard icon={CheckCircle} label="Completed"          value={overview?.completed_jobs ?? '—'} />
        <StatCard icon={Clock}       label="Pending/Processing" value={overview?.pending_jobs ?? '—'} />
        <StatCard icon={XCircle}     label="Failed"             value={overview?.failed_jobs ?? '—'} danger />
        <StatCard icon={Zap}         label="Total Jobs"         value={overview?.total_jobs ?? '—'} />
      </div>

      {charts && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card lg:col-span-2">
            <h2 className="font-semibold text-arang mb-4">Konversi &amp; User Baru (30 Hari)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={charts.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend />
                <Line type="monotone" dataKey="conversions" stroke="#6366f1" strokeWidth={2} dot={false} name="Konversi" />
                <Line type="monotone" dataKey="users"       stroke="#22c55e" strokeWidth={2} dot={false} name="User Baru" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h2 className="font-semibold text-arang mb-4">Distribusi Metode</h2>
            {charts.formats.length === 0
              ? <p className="text-sm text-ampas/70 mt-8 text-center">Belum ada data</p>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={charts.formats} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={75}
                      label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {charts.formats.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Legend formatter={(v) => String(v).toUpperCase()} />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </div>
        </div>
      )}

      {activeJobs.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-arang mb-4">Jobs Sedang Diproses ({activeJobs.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ampas border-b">
                  {['Job ID', 'User', 'File', 'Status', 'Waktu'].map(h => (
                    <th key={h} className="pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeJobs.map((job: any) => (
                  <tr key={job.id} className="border-b last:border-0 hover:bg-serat">
                    <td className="py-2 font-mono text-xs text-ampas">{String(job.id).slice(0, 8)}</td>
                    <td className="py-2">{job.username ?? String(job.user_id ?? '').slice(0, 8)}</td>
                    <td className="py-2 truncate max-w-[200px]">{job.original_filename}</td>
                    <td className="py-2"><StatusBadge status={job.status} /></td>
                    <td className="py-2 text-xs text-ampas">
                      {job.created_at ? new Date(job.created_at).toLocaleTimeString('id-ID') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
