import { useState, useEffect, useCallback } from 'react'
import { listJobs, deleteJob, getJob, downloadUrl, downloadAllUrl, downloadFile, downloadAllFiles } from '@/services/jobService'
import type { ConversionJob } from '@/types'
import { StatusBadge } from '@/components/StatusBadge'
import toast from 'react-hot-toast'
import { Search, Trash2, Eye, Download, X, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

const STATUSES = ['', 'completed', 'failed', 'processing', 'pending']
const FORMATS  = ['', 'stl', 'svg', 'dxf']
const PER_PAGE = 20

const fmtBytes = (b: number | null) =>
  !b ? '—' : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`

export default function HistoryPage() {
  const [jobs, setJobs]       = useState<ConversionJob[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(false)

  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [format, setFormat]   = useState('')

  const [detail, setDetail]   = useState<ConversionJob | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await listJobs({ page, limit: PER_PAGE, status: status || undefined, search: search || undefined })
      let items = r.items
      if (format) items = items.filter((j) => j.output_files && format in j.output_files)
      setJobs(items)
      setTotal(r.total)
    } catch {
      toast.error('Gagal memuat riwayat')
    } finally {
      setLoading(false)
    }
  }, [page, search, status, format])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus job dan semua file output?')) return
    try {
      await deleteJob(id)
      toast.success('Job dihapus')
      load()
    } catch {
      toast.error('Gagal menghapus job')
    }
  }

  const handleDetail = async (id: string) => {
    setDetailLoading(true)
    setDetail(null)
    try {
      const j = await getJob(id)
      setDetail(j)
    } catch {
      toast.error('Gagal memuat detail')
    } finally {
      setDetailLoading(false)
    }
  }

  const resetFilters = () => { setSearch(''); setStatus(''); setFormat(''); setPage(1) }
  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-arang mb-6">Riwayat Konversi</h1>

      {/* Filter bar */}
      <div className="card mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ampas/70" />
          <input
            className="input pl-9"
            placeholder="Cari nama file..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input w-40">
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'Semua Status'}</option>)}
        </select>
        <select value={format} onChange={(e) => { setFormat(e.target.value); setPage(1) }} className="input w-36">
          {FORMATS.map((f) => <option key={f} value={f}>{f ? f.toUpperCase() : 'Semua Format'}</option>)}
        </select>
        <button onClick={resetFilters} className="btn-secondary gap-1">
          <X size={14} /> Reset
        </button>
        <button onClick={load} className="btn-secondary gap-1">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-ampas/70">Memuat...</div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-ampas/70 gap-2">
            <Search size={32} />
            <p>Tidak ada riwayat konversi</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-serat border-b">
              <tr>
                {['File', 'Metode', 'Format', 'Status', 'Ukuran', 'Tanggal', 'Aksi'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-ampas uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-kayu">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-serat transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium text-arang truncate">{job.original_filename}</p>
                    <p className="text-xs text-ampas/70 mt-0.5">{job.id.slice(0, 8)}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-ampas">{job.method}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {job.output_files
                        ? Object.keys(job.output_files).map((f) => (
                            <span key={f} className="badge bg-kuningan text-kuningan uppercase">{f}</span>
                          ))
                        : <span className="text-ampas/70">—</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                  <td className="px-4 py-3 text-ampas">{fmtBytes(job.file_size_bytes)}</td>
                  <td className="px-4 py-3 text-ampas whitespace-nowrap">
                    {new Date(job.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {job.status === 'completed' && (
                        <button onClick={() => downloadAllFiles(job.id)} title="Download ZIP" className="p-1.5 rounded hover:bg-kayu/30 text-ampas hover:text-primary-600">
                          <Download size={15} />
                        </button>
                      )}
                      <button onClick={() => handleDetail(job.id)} title="Detail" className="p-1.5 rounded hover:bg-kayu/30 text-ampas hover:text-status-proses">
                        <Eye size={15} />
                      </button>
                      <button onClick={() => handleDelete(job.id)} title="Hapus" className="p-1.5 rounded hover:bg-kayu/30 text-ampas hover:text-status-gagal">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-ampas">Total: {total} job</span>
          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={clsx('h-8 w-8 rounded-lg text-xs font-medium', p === page ? 'bg-primary-600 text-white' : 'bg-white border text-ampas hover:bg-serat')}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-arang">Detail Job</h2>
              <button onClick={() => setDetail(null)} className="p-1 rounded hover:bg-kayu/30">
                <X size={18} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
              </div>
            ) : detail && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['ID', detail.id],
                    ['File', detail.original_filename],
                    ['Status', detail.status],
                    ['Metode', detail.method],
                    ['Waktu proses', detail.processing_time_seconds ? `${detail.processing_time_seconds}s` : '—'],
                    ['Dibuat', new Date(detail.created_at).toLocaleString('id-ID')],
                    ['Selesai', detail.completed_at ? new Date(detail.completed_at).toLocaleString('id-ID') : '—'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="bg-serat rounded-lg p-3">
                      <p className="text-xs text-ampas/70">{k}</p>
                      <p className="font-medium text-arang truncate capitalize">{String(v)}</p>
                    </div>
                  ))}
                </div>

                {detail.settings && (
                  <div>
                    <p className="font-semibold text-ampas mb-2">Settings</p>
                    <pre className="bg-serat rounded-lg p-3 text-xs overflow-auto">{JSON.stringify(detail.settings, null, 2)}</pre>
                  </div>
                )}

                {detail.ai_analysis && (
                  <div>
                    <p className="font-semibold text-ampas mb-2">Hasil Analisis AI</p>
                    <div className="bg-status-proses rounded-lg p-3 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        {detail.ai_analysis.complexity && (
                          <div>
                            <p className="text-[11px] text-ampas">Complexity</p>
                            <p className="font-medium text-arang capitalize">{detail.ai_analysis.complexity}</p>
                          </div>
                        )}
                        {detail.ai_analysis.background && (
                          <div>
                            <p className="text-[11px] text-ampas">Background</p>
                            <p className="font-medium text-arang capitalize">{detail.ai_analysis.background}</p>
                          </div>
                        )}
                        {typeof detail.ai_analysis.has_text === 'boolean' && (
                          <div>
                            <p className="text-[11px] text-ampas">Has text</p>
                            <p className="font-medium text-arang">{detail.ai_analysis.has_text ? 'Ya' : 'Tidak'}</p>
                          </div>
                        )}
                        {detail.ai_analysis.recommended_method && (
                          <div>
                            <p className="text-[11px] text-ampas">Recommended method</p>
                            <p className="font-medium text-arang capitalize">{detail.ai_analysis.recommended_method}</p>
                          </div>
                        )}
                      </div>

                      {detail.ai_analysis.recommended_formats && detail.ai_analysis.recommended_formats.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] text-ampas mb-1">Recommended formats</p>
                          <div className="flex gap-1 flex-wrap">
                            {detail.ai_analysis.recommended_formats.map((f) => (
                              <span key={f} className="badge bg-kuningan text-kuningan uppercase">{f}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {detail.ai_analysis.notes && (
                        <div className="mt-3">
                          <p className="text-[11px] text-ampas mb-1">Notes</p>
                          <p className="text-arang leading-relaxed">{detail.ai_analysis.notes}</p>
                        </div>
                      )}

                      {detail.ai_analysis.parse_error && detail.ai_analysis.raw_analysis && (
                        <div className="mt-3">
                          <p className="text-[11px] text-ampas mb-1">Raw AI output (parse error)</p>
                          <pre className="bg-white/60 rounded p-2 overflow-auto whitespace-pre-wrap">{detail.ai_analysis.raw_analysis}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {detail.output_files && Object.keys(detail.output_files).length > 0 && (
                  <div>
                    <p className="font-semibold text-ampas mb-2">File Output</p>
                    <div className="space-y-2">
                      {Object.keys(detail.output_files).map((fmt) => (
                        <div key={fmt} className="flex items-center justify-between bg-serat rounded-lg px-3 py-2">
                          <span className="uppercase font-semibold text-arang">{fmt}</span>
                          <button onClick={() => downloadFile(detail.id, fmt)} className="text-primary-600 hover:underline font-medium flex items-center gap-1">
                            <Download size={13} /> Download
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
