import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminService } from '../../services/adminService'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

interface LogEntry {
  id: string
  user_id: string
  username: string
  action: string
  ip_address: string | null
  created_at: string
}

const ACTION_COLORS: Record<string, string> = {
  convert:  'badge-indigo',
  download: 'badge-green',
  delete:   'badge-red',
  login:    'badge-blue',
  register: 'badge-purple',
  logout:   'badge-gray',
}

const PAGE_SIZE = 50

export default function ActivityLogsPage() {
  const [page, setPage]           = useState(0)
  const [search, setSearch]       = useState('')
  const [actionFilter, setAction] = useState('')
  const [ipFilter, setIpFilter]   = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const params = {
    skip:       page * PAGE_SIZE,
    limit:      PAGE_SIZE,
    action:     actionFilter || undefined,
    ip_address: ipFilter     || undefined,
    date_from:  dateFrom     || undefined,
    date_to:    dateTo       || undefined,
  }

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-logs', params],
    queryFn: () => adminService.getLogs(params),
  })

  const logs: LogEntry[]  = data?.items ?? []
  const total: number     = data?.total ?? 0
  const totalPages        = Math.ceil(total / PAGE_SIZE)

  // Client-side username/user_id search
  const filtered = search
    ? logs.filter(
        l =>
          l.username.toLowerCase().includes(search.toLowerCase()) ||
          l.user_id.toLowerCase().includes(search.toLowerCase()),
      )
    : logs

  const clearFilters = () => {
    setSearch('')
    setAction('')
    setIpFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(0)
  }

  const hasFilters = !!(search || actionFilter || ipFilter || dateFrom || dateTo)

  // CSV Export
  const exportCsv = () => {
    const header = 'id,username,user_id,action,ip_address,created_at'
    const rows = logs.map(l =>
      [l.id, l.username, l.user_id, l.action, l.ip_address ?? '', l.created_at].join(','),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `activity_logs_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Logs</h1>
          <p className="text-slate-400 text-sm mt-1">
            {total.toLocaleString()} total log entries
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <ArrowPathIcon className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
              showFilters
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'border-slate-600 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <FunnelIcon className="w-4 h-4" />
            Filters{hasFilters ? ' •' : ''}
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Username search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Username / User ID…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0) }}
                className="input pl-9 w-full text-sm"
              />
            </div>

            {/* Action filter */}
            <select
              value={actionFilter}
              onChange={e => { setAction(e.target.value); setPage(0) }}
              className="input text-sm"
            >
              <option value="">All Actions</option>
              {['convert', 'download', 'delete', 'login', 'register', 'logout'].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            {/* IP filter */}
            <input
              type="text"
              placeholder="IP Address…"
              value={ipFilter}
              onChange={e => { setIpFilter(e.target.value); setPage(0) }}
              className="input text-sm"
            />

            {/* Date from */}
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(0) }}
              className="input text-sm"
            />

            {/* Date to */}
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(0) }}
              className="input text-sm"
            />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-3 text-slate-400 font-medium">Time</th>
                <th className="px-4 py-3 text-slate-400 font-medium">User</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Action</th>
                <th className="px-4 py-3 text-slate-400 font-medium">IP Address</th>
                <th className="px-4 py-3 text-slate-400 font-medium">User ID</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-700 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    No log entries found
                  </td>
                </tr>
              ) : (
                filtered.map(log => (
                  <tr
                    key={log.id}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap font-mono text-xs">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{log.username}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${
                          ACTION_COLORS[log.action] ?? 'badge-gray'
                        } capitalize`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {log.ip_address ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 truncate max-w-[140px]">
                      {log.user_id}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
            <span className="text-sm text-slate-400">
              Page {page + 1} of {totalPages} ({total.toLocaleString()} entries)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-600 text-slate-300
                           hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-600 text-slate-300
                           hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
