import { useState, useEffect } from 'react'
import {
  fetchDefaultSettings, updateDefaultSettings,
  fetchPresets, createPreset, updatePreset, deletePreset,
} from '@/services/adminService'
import toast from 'react-hot-toast'
import { Save, Plus, Edit2, Trash2, X, AlertCircle } from 'lucide-react'

interface Preset {
  id: string
  name: string
  max_conversions_per_day: number
  max_conversions_per_month: number
  max_file_size_mb: number
  allowed_formats: string[]
  use_ai_analysis: boolean
}

export default function DefaultLimitsPage() {
  const [defaults, setDefaults] = useState<Record<string, any>>({})
  const [presets, setPresets]   = useState<Preset[]>([])
  const [saving, setSaving]     = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [editPreset, setEditPreset]   = useState<Partial<Preset> | null>(null)
  const [isNewPreset, setIsNewPreset] = useState(false)

  useEffect(() => {
    fetchDefaultSettings().then(setDefaults).catch(() => {})
    fetchPresets().then(setPresets).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const allowedKeys = ['default_user_limits','conversion_settings','storage','ai'] as const
      const payload: Record<string, any> = {}
      for (const key of allowedKeys) {
        if (defaults[key] !== undefined) {
          payload[key] = defaults[key]
        }
      }
      await updateDefaultSettings(payload)
      toast.success('Pengaturan disimpan')
      setConfirmSave(false)
    } catch {
      toast.error('Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const handlePresetSave = async () => {
    if (!editPreset) return
    try {
      if (isNewPreset) {
        const created = await createPreset(editPreset)
        setPresets([...presets, created as Preset])
      } else {
        const updated = await updatePreset(editPreset.id!, editPreset)
        setPresets(presets.map((p) => p.id === editPreset.id ? updated as Preset : p))
      }
      toast.success('Preset disimpan')
      setEditPreset(null)
    } catch {
      toast.error('Gagal simpan preset')
    }
  }

  const handlePresetDelete = async (id: string) => {
    if (!confirm('Hapus preset ini?')) return
    try {
      await deletePreset(id)
      setPresets(presets.filter((p) => p.id !== id))
      toast.success('Preset dihapus')
    } catch {
      toast.error('Gagal hapus')
    }
  }

  const setDef = (path: string[], val: any) => {
    setDefaults((prev) => {
      const next = { ...prev }
      let cur: any = next
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] = { ...cur[path[i]] }
      cur[path[path.length - 1]] = val
      return next
    })
  }

  const dl = defaults?.default_user_limits ?? {}
  const cs = defaults?.conversion_settings ?? {}
  const ai = defaults?.ai ?? {}
  const st = defaults?.storage ?? {}

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-arang">Pengaturan Limit Default</h1>
          <p className="text-ampas text-sm mt-1">Berlaku untuk user baru yang mendaftar.</p>
        </div>
        <button onClick={() => setConfirmSave(true)} className="btn-primary gap-2">
          <Save size={16} /> Simpan Semua
        </button>
      </div>

      {/* Section 1 */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-arang">Default Limit User Baru</h2>
        <div className="grid grid-cols-2 gap-4">
           {[
            [['default_user_limits','max_conversions_per_day'],'Max Konversi/Hari'],
            [['default_user_limits','max_conversions_per_month'],'Max Konversi/Bulan'],
            [['default_user_limits','max_file_size_mb'],'Max Ukuran File (MB)'],
            [['default_user_limits','max_output_formats'],'Max Format Sekaligus'],
          ].map(([path, label]) => (
            <div key={(path as string[]).join('.')}>
              <label className="label">{label as string}</label>
              <input type="number" className="input" value={(dl as any)[(path as string[])[1]] ?? ''} onChange={(e) => setDef(path as string[], +e.target.value)} />
            </div>
          ))}
        </div>
        <div>
          <label className="label">Format Dibolehkan</label>
          <div className="flex gap-3">
            {['stl','svg','dxf'].map((f) => (
              <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(dl.allowed_formats ?? []).includes(f)}
                  onChange={(e) => {
                    const cur = dl.allowed_formats ?? []
                    setDef(['default_user_limits','allowed_formats'], e.target.checked ? [...cur, f] : cur.filter((x: string) => x !== f))
                  }}
                />
                <span className="text-sm uppercase font-medium">{f}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="ai_def" checked={!!dl.use_ai_analysis} onChange={(e) => setDef(['default_user_limits','use_ai_analysis'], e.target.checked)} />
          <label htmlFor="ai_def" className="text-sm text-ampas">Akses AI Analysis (default)</label>
        </div>
      </div>

      {/* Section 2: Presets */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-arang">Preset Paket</h2>
          <button onClick={() => { setEditPreset({ name:'', max_conversions_per_day:10, max_conversions_per_month:100, max_file_size_mb:30, allowed_formats:['stl'], use_ai_analysis:false }); setIsNewPreset(true) }} className="btn-secondary text-xs gap-1">
            <Plus size={13} /> Tambah Paket
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              {['Nama','Konversi/Hari','Konversi/Bulan','Max MB','Format','AI','Aksi'].map((h) => (
                <th key={h} className="text-left py-2 px-2 text-xs font-semibold text-ampas uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {presets.map((p) => (
              <tr key={p.id}>
                <td className="py-2 px-2 font-semibold">{p.name}</td>
                <td className="py-2 px-2">{p.max_conversions_per_day}</td>
                <td className="py-2 px-2">{p.max_conversions_per_month}</td>
                <td className="py-2 px-2">{p.max_file_size_mb}</td>
                <td className="py-2 px-2 uppercase">{(p.allowed_formats ?? []).join(', ')}</td>
                <td className="py-2 px-2">{p.use_ai_analysis ? '✅' : '—'}</td>
                <td className="py-2 px-2">
                  <div className="flex gap-1">
                    <button onClick={() => { setEditPreset(p); setIsNewPreset(false) }} className="p-1 rounded hover:bg-kayu/30 text-ampas"><Edit2 size={13} /></button>
                    <button onClick={() => handlePresetDelete(p.id)} className="p-1 rounded hover:bg-kayu/30 text-status-gagal"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {presets.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-ampas/70">Belum ada preset.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Section 3: Conversion defaults */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-arang">Setting Konversi Default</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Metode Default</label>
            <select className="input" value={cs.default_method ?? 'relief'} onChange={(e) => setDef(['conversion_settings','default_method'], e.target.value)}>
              <option value="heightmap">Heightmap</option>
              <option value="relief">Relief</option>
              <option value="silhouette">Silhouette</option>
            </select>
          </div>
          {[
            [['conversion_settings','default_threshold'],'Threshold Default', cs.default_threshold],
            [['conversion_settings','default_max_height_mm'],'Tinggi Relief (mm)', cs.default_max_height_mm],
            [['conversion_settings','default_base_thickness_mm'],'Base Thickness (mm)', cs.default_base_thickness_mm],
             [['storage','auto_delete_after_days'],'Auto-delete Output (hari)', st.auto_delete_after_days],
             [['storage','max_storage_per_user_mb'],'Max Storage/User (MB)', st.max_storage_per_user_mb],
             [['storage','max_upload_file_mb'],'Max Upload Size (MB)', st.max_upload_file_mb],
          ].map(([path, label, val]) => (
            <div key={(path as string[]).join('.')}>
              <label className="label">{label as string}</label>
              <input type="number" step="0.1" className="input" value={val ?? ''} onChange={(e) => setDef(path as string[], +e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: AI */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-arang">AI Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Provider</label>
            <select
              className="input"
              value={ai.provider ?? 'anthropic'}
              onChange={(e) => setDef(['ai','provider'], e.target.value)}
            >
              <option value="anthropic">Anthropic Claude / SumoPod</option>
              <option value="openai">OpenAI</option>
              <option value="custom">Custom OpenAI-compatible</option>
            </select>
            <p className="text-[11px] text-ampas/70 mt-1">Gunakan provider OpenAI-compatible (model chat.completions).</p>
          </div>
          <div>
            <label className="label">API Key</label>
            <input
              type="password"
              className="input"
              autoComplete="new-password"
              value={ai.api_key ?? ''}
              onChange={(e) => setDef(['ai','api_key'], e.target.value)}
            />
          </div>
          <div>
            <label className="label">Base URL</label>
            <input
              className="input"
              placeholder={ai.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com'}
              value={ai.base_url ?? ''}
              onChange={(e) => setDef(['ai','base_url'], e.target.value)}
            />
            <p className="text-[11px] text-ampas/70 mt-1">Untuk provider custom isi URL endpoint OpenAI-compatible.</p>
          </div>
          <div>
            <label className="label">Model</label>
            <input className="input" value={ai.model ?? ''} onChange={(e) => setDef(['ai','model'], e.target.value)} />
          </div>
          <div>
            <label className="label">Max Tokens per Analisis</label>
            <input type="number" className="input" value={ai.max_tokens ?? ''} onChange={(e) => setDef(['ai','max_tokens'], +e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="auto_ai" checked={!!ai.analyze_before_convert} onChange={(e) => setDef(['ai','analyze_before_convert'], e.target.checked)} />
          <label htmlFor="auto_ai" className="text-sm text-ampas">Auto-analisis sebelum konversi</label>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={22} className="text-kuningan flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-arang">Konfirmasi Simpan</h3>
                <p className="text-sm text-ampas mt-1">Perubahan ini tidak mempengaruhi user yang sudah ada, hanya berlaku untuk user baru.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Menyimpan...' : 'Ya, Simpan'}</button>
              <button onClick={() => setConfirmSave(false)} className="btn-secondary flex-1">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Preset modal */}
      {editPreset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{isNewPreset ? 'Tambah Preset' : 'Edit Preset'}</h3>
              <button onClick={() => setEditPreset(null)}><X size={18} /></button>
            </div>
            <div>
              <label className="label">Nama Paket</label>
              <input className="input" value={editPreset.name ?? ''} onChange={(e) => setEditPreset({ ...editPreset, name: e.target.value })} />
            </div>
            {[
              ['max_conversions_per_day','Konversi/Hari'],
              ['max_conversions_per_month','Konversi/Bulan'],
              ['max_file_size_mb','Max File (MB)'],
            ].map(([k,l]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input type="number" className="input" value={(editPreset as any)[k] ?? ''} onChange={(e) => setEditPreset({ ...editPreset, [k]: +e.target.value })} />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ep_ai" checked={!!editPreset.use_ai_analysis} onChange={(e) => setEditPreset({ ...editPreset, use_ai_analysis: e.target.checked })} />
              <label htmlFor="ep_ai" className="text-sm">Akses AI Analysis</label>
            </div>
            <div className="flex gap-3">
              <button onClick={handlePresetSave} className="btn-primary flex-1">Simpan</button>
              <button onClick={() => setEditPreset(null)} className="btn-secondary flex-1">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
