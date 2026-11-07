import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/adminService'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Users, Zap, CheckCircle, AlertTriangle, TrendingUp, XCircle, Clock,
  ArrowDownToLine, RotateCw, FileBarChart,
} from 'lucide-react'

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7']

type Period = { label: string; days: number }
const PERIODS: Period[] = [
  { label: '7 hari', days: 7 },
  { label: '30 hari', days: 30 },
  { label: '90 hari', days: 90 },
]

function StatCard({ icon: Icon, label, value, danger }: {
  icon: React.ElementType; label: string; value: string | number; danger?: boolean
}) {
  const isDanger = danger && Number(value) > 0
  return (
    <div className={`card flex items-center gap-4 ${isDanger ? 'border-status-gagal bg-status-gagal' : ''}`}>
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${isDanger ? 'bg-status-gagal' : 'bg-primary-100'}`}>
        <Icon size={22} className={isDanger ? 'text-status-gagal' : 'text-primary-600'} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-ampas truncate">{label}</p>
        <p className={`text-2xl font-bold ${isDanger ? 'text-status-gagal' : 'text-arang'}`}>
          {typeof value === 'number' ? value.toLocaleString('id-ID') : value}
        </p>
      </div>
    </div>
  )
}

export default function StatsPage() {
  const [days, setDays] = useState(30)

  const overviewQuery = useQuery({
    queryKey: ['admin-stats-overview'],
    queryFn: () => adminService.getStats(),
  })

  const chartsQuery = useQuery({
    queryKey: ['admin-stats-charts', days],
    queryFn: () => adminService.getCharts(days),
  })

  const overview: any = overviewQuery.data ?? null
  const charts: any = chartsQuery.data ?? null
  const daily: any[] = charts?.daily ?? []
  const formats: any[] = charts?.formats ?? []

  const isFetching = overviewQuery.isFetching || chartsQuery.isFetching
  const refetchAll = () => { overviewQuery.refetch(); chartsQuery.refetch() }

  // Ringkasan periode + success rate, dihitung dari data yang benar-benar diterima.
  const summary = useMemo(() => {
    const periodJobs = daily.reduce((a, r) => a + (r.conversions ?? 0), 0)
    const periodUsers = daily.reduce((a, r) => a + (r.users ?? 0), 0)
    const total = Number(overview?.total_jobs ?? 0)
    const completed = Number(overview?.completed_jobs ?? 0)
    const failed = Number(overview?.failed_jobs ?? 0)
    const finished = completed + failed
    return {
      periodJobs,
      periodUsers,
      peak: daily.reduce<{ date: string; conversions: number } | null>(
        (best, r) => (!best || r.conversions > best.conversions ? { date: r.date, conversions: r.conversions } : best),
        null,
      ),
      successRate: finished > 0 ? (completed / finished) * 100 : null,
      total,
    }
  }, [daily, overview])

  const exportCsv = () => {
    if (daily.length === 0) return
    const header = 'tanggal,konversi,user_baru'
    const rows = daily.map((r) => [r.date, r.conversions, r.users].join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `statistik-${days}harian-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-arang flex items-center gap-2">
            <FileBarChart size={24} className="text-primary-600" />
            Statistik &amp; Laporan
          </h1>
          <p className="text-ampas text-sm mt-1">
            Ringkasan performa konversi dan pertumbuhan user.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-kayu overflow-hidden">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  days === p.days ? 'bg-primary-600 text-white' : 'bg-white text-ampas hover:bg-serat'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={refetchAll} disabled={isFetching} className="btn-ghost flex items-center gap-2 text-sm">
            <RotateCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={exportCsv} disabled={daily.length === 0} className="btn-secondary flex items-center gap-2 text-sm">
            <ArrowDownToLine className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp}  label={`Konversi (${days} hari)`} value={summary.periodJobs} />
        <StatCard icon={Users}       label={`User Baru (${days} hari)`} value={summary.periodUsers} />
        <StatCard icon={CheckCircle} label="Success Rate" value={summary.successRate === null ? '—' : `${summary.successRate.toFixed(1)}%`} />
        <StatCard icon={Zap}         label="Total Job (semua waktu)" value={overview?.total_jobs ?? '—'} />
      </div>

      {/* Kartu total */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}       label="Total Users"        value={overview?.total_users ?? '—'} />
        <StatCard icon={Users}       label="Active Users"       value={overview?.active_users ?? '—'} />
        <StatCard icon={Clock}       label="Pending/Processing" value={overview?.pending_jobs ?? '—'} />
        <StatCard icon={XCircle}     label="Failed"             value={overview?.failed_jobs ?? '—'} danger />
      </div>

      {/* Grafik */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h2 className="font-semibold text-arang mb-4">Tren Konversi &amp; User Baru</h2>
          {chartsQuery.isLoading ? (
            <div className="h-[240px] rounded-lg bg-serat animate-pulse" />
          ) : daily.length === 0 ? (
            <p className="text-sm text-ampas/70 py-16 text-center">Belum ada data</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="conversions" stroke="#6366f1" strokeWidth={2} dot={false} name="Konversi" />
                <Line type="monotone" dataKey="users"       stroke="#22c55e" strokeWidth={2} dot={false} name="User Baru" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-arang mb-4">Distribusi Metode</h2>
          {chartsQuery.isLoading ? (
            <div className="h-[240px] rounded-lg bg-serat animate-pulse" />
          ) : formats.length === 0 ? (
            <p className="text-sm text-ampas/70 py-16 text-center">Belum ada data</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={formats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {formats.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend formatter={(v) => String(v).toUpperCase()} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-arang mb-4">Konversi Harian</h2>
        {chartsQuery.isLoading ? (
          <div className="h-[220px] rounded-lg bg-serat animate-pulse" />
        ) : daily.length === 0 ? (
          <p className="text-sm text-ampas/70 py-16 text-center">Belum ada data</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="conversions" fill="#6366f1" name="Konversi" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Laporan tabel */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-arang">Laporan Harian ({days} hari terakhir)</h2>
          {summary.peak && (
            <span className="text-xs text-ampas">
              Puncak: <strong className="text-arang">{summary.peak.conversions}</strong> konversi ({summary.peak.date})
            </span>
          )}
        </div>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-ampas border-b">
                <th className="py-2 px-2 font-medium">Tanggal</th>
                <th className="py-2 px-2 font-medium text-right">Konversi</th>
                <th className="py-2 px-2 font-medium text-right">User Baru</th>
                <th className="py-2 px-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {chartsQuery.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="py-2 px-2"><div className="h-4 w-16 bg-serat rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : daily.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-ampas">Belum ada data pada periode ini</td>
                </tr>
              ) : (
                daily.map((r) => (
                  <tr key={r.date} className="border-b last:border-0 hover:bg-serat">
                    <td className="py-2 px-2 font-mono text-xs">{r.date}</td>
                    <td className="py-2 px-2 text-right">{r.conversions.toLocaleString('id-ID')}</td>
                    <td className="py-2 px-2 text-right">{r.users.toLocaleString('id-ID')}</td>
                    <td className="py-2 px-2 text-right font-semibold">{(r.conversions + r.users).toLocaleString('id-ID')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!overviewQuery.isLoading && !overview && (
        <div className="rounded-xl bg-kuningan/20 border border-kuningan p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-kuningan flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ampas">Gagal memuat statistik. Coba Refresh.</p>
        </div>
      )}
    </div>
  )
}
