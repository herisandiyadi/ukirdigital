import { useState, useEffect } from 'react'
import { fetchDefaultSettings, updateDefaultSettings } from '@/services/adminService'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { Save, AlertCircle, Cpu, HardDrive, Sparkles, RotateCw, Lock } from 'lucide-react'
import clsx from 'clsx'

type SectionKey = 'conversion_settings' | 'storage' | 'ai'

const SECTIONS: { key: SectionKey; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'conversion_settings', label: 'Konversi',    icon: Cpu,       desc: 'Parameter default proses konversi 3D' },
  { key: 'storage',             label: 'Penyimpanan', icon: HardDrive, desc: 'Kuota file dan kebijakan pembersihan' },
  { key: 'ai',                  label: 'AI',          icon: Sparkles,  desc: 'Konfigurasi API analisis gambar (OpenAI-compatible)' },
]

// Field teks/angka per section. `step` untuk nilai desimal.
const FIELDS: Record<SectionKey, { key: string; label: string; hint?: string; step?: number }[]> = {
  conversion_settings: [
    { key: 'default_threshold',            label: 'Threshold Default' },
    { key: 'default_max_height_mm',        label: 'Tinggi Relief (mm)', step: 0.1 },
    { key: 'default_base_thickness_mm',    label: 'Base Thickness (mm)', step: 0.1 },
    { key: 'default_scale_mm_per_px',      label: 'Skala (mm/px)', step: 0.01 },
    { key: 'default_resolution',           label: 'Resolusi' },
    { key: 'default_smoothing_blur_radius', label: 'Smoothing Blur Radius', step: 0.1 },
    { key: 'default_contrast_low_pct',     label: 'Contrast Low (%)', step: 0.1 },
    { key: 'default_contrast_high_pct',    label: 'Contrast High (%)', step: 0.1 },
    { key: 'default_gamma',                label: 'Gamma', step: 0.1 },
  ],
  storage: [
    { key: 'max_storage_per_user_mb', label: 'Max Storage/User (MB)' },
    { key: 'auto_delete_after_days',  label: 'Auto-delete Output (hari)' },
    { key: 'max_upload_file_mb',      label: 'Max Upload File (MB)' },
  ],
  ai: [
    { key: 'model',      label: 'Model' },
    { key: 'max_tokens', label: 'Max Tokens per Analisis' },
    { key: 'base_url',   label: 'Base URL', hint: 'Kosongkan untuk memakai AI_BASE_URL dari env.' },
    { key: 'api_key',    label: 'API Key' },
  ],
}

const METHODS = [
  { value: 'heightmap',  label: 'Heightmap' },
  { value: 'relief',     label: 'Relief' },
  { value: 'silhouette', label: 'Silhouette' },
]

const RELIEF_DETAIL = [
  { value: 'grayscale', label: 'Grayscale' },
  { value: 'binary',    label: 'Binary' },
]

export default function SystemSettingsPage() {
  const { user } = useAuthStore()
  const isSuperadmin = user?.role === 'superadmin'

  const [data, setData]       = useState<Record<string, any> | null>(null)
  const [section, setSection] = useState<SectionKey>('conversion_settings')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [confirm, setConfirm] = useState(false)

  const load = () => {
    setLoading(true)
    fetchDefaultSettings()
      .then((d: any) => { setData(d); setDirty(false) })
      .catch(() => toast.error('Gagal memuat pengaturan'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const setVal = (sec: SectionKey, key: string, val: any) => {
    setData((prev) => (prev ? { ...prev, [sec]: { ...prev[sec], [key]: val } } : prev))
    setDirty(true)
  }

  const handleSave = async () => {
    if (!data) return
    setSaving(true)
    try {
      const payload: Record<string, any> = {}
      for (const s of SECTIONS) {
        if (data[s.key] !== undefined) payload[s.key] = data[s.key]
      }
      await updateDefaultSettings(payload)
      toast.success('System settings disimpan')
      setConfirm(false)
      setDirty(false)
    } catch (e: any) {
      const code = e?.response?.status
      toast.error(code === 403 ? 'Hanya superadmin yang boleh mengubah system settings' : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const sec = data?.[section] ?? {}
  const active = SECTIONS.find((s) => s.key === section)!

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-arang">System Settings</h1>
          <p className="text-ampas text-sm mt-1">
            Konfigurasi global aplikasi. Berlaku untuk proses baru, bukan mengubah data yang sudah ada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading || saving} className="btn-ghost flex items-center gap-2 text-sm">
            <RotateCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            Muat ulang
          </button>
          <button
            onClick={() => setConfirm(true)}
            disabled={!dirty || saving || !isSuperadmin}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Save size={16} />
            Simpan
          </button>
        </div>
      </div>

      {!isSuperadmin && (
        <div className="rounded-xl bg-kuningan/20 border border-kuningan p-4 flex items-start gap-3">
          <Lock size={18} className="text-kuningan flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ampas">
            Anda login sebagai <strong>admin</strong>. Pengaturan ini hanya bisa diubah oleh <strong>superadmin</strong> —
            tampilan di sini bersifat baca saja.
          </p>
        </div>
      )}

      {dirty && isSuperadmin && (
        <div className="rounded-xl bg-primary-50 border border-primary-100 p-3 text-sm text-primary-700">
          Ada perubahan yang belum disimpan.
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-kayu">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              section === key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-ampas hover:text-arang',
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <div className="card space-y-5">
        <div>
          <h2 className="font-semibold text-arang">{active.label}</h2>
          <p className="text-xs text-ampas mt-0.5">{active.desc}</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-serat animate-pulse" />
            ))}
          </div>
        ) : section === 'conversion_settings' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Metode Default</label>
                <select
                  className="input"
                  disabled={!isSuperadmin}
                  value={sec.default_method ?? 'relief'}
                  onChange={(e) => setVal(section, 'default_method', e.target.value)}
                >
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Relief Detail</label>
                <select
                  className="input"
                  disabled={!isSuperadmin}
                  value={sec.default_relief_detail ?? 'grayscale'}
                  onChange={(e) => setVal(section, 'default_relief_detail', e.target.value)}
                >
                  {RELIEF_DETAIL.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <p className="text-[11px] text-ampas/70 mt-1">
                  Grayscale lebih baik untuk gambar ornate/shaded.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FIELDS.conversion_settings.map(({ key, label, step }) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    type="number"
                    step={step ?? 1}
                    className="input"
                    disabled={!isSuperadmin}
                    value={sec[key] ?? ''}
                    onChange={(e) => setVal(section, key, e.target.value === '' ? '' : +e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="contrast_stretch"
                disabled={!isSuperadmin}
                checked={!!sec.default_contrast_stretch}
                onChange={(e) => setVal(section, 'default_contrast_stretch', e.target.checked)}
              />
              <label htmlFor="contrast_stretch" className="text-sm text-ampas">
                Contrast stretch otomatis (bantu munculkan detail midtone)
              </label>
            </div>
          </>
        ) : section === 'storage' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FIELDS.storage.map(({ key, label }) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    type="number"
                    className="input"
                    disabled={!isSuperadmin}
                    value={sec[key] ?? ''}
                    onChange={(e) => setVal(section, key, e.target.value === '' ? '' : +e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="label">Tipe Input Diizinkan</label>
              <div className="flex flex-wrap gap-3">
                {['image/png', 'image/jpeg', 'image/webp'].map((t) => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isSuperadmin}
                      checked={(sec.allowed_input_types ?? []).includes(t)}
                      onChange={(e) => {
                        const cur: string[] = sec.allowed_input_types ?? []
                        setVal(section, 'allowed_input_types',
                          e.target.checked ? [...cur, t] : cur.filter((x) => x !== t))
                      }}
                    />
                    <span className="text-sm font-mono">{t}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Provider</label>
                <select
                  className="input"
                  disabled={!isSuperadmin}
                  value={sec.provider ?? 'custom'}
                  onChange={(e) => setVal(section, 'provider', e.target.value)}
                >
                  <option value="openai">OpenAI</option>
                  <option value="custom">Custom OpenAI-compatible</option>
                </select>
                <p className="text-[11px] text-ampas/70 mt-1">
                  Gunakan provider OpenAI-compatible (protokol chat.completions).
                </p>
              </div>
              {FIELDS.ai.map(({ key, label, hint }) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    type={key === 'api_key' ? 'password' : key === 'max_tokens' ? 'number' : 'text'}
                    className="input"
                    autoComplete={key === 'api_key' ? 'new-password' : undefined}
                    placeholder={key === 'base_url' ? 'https://api.openai.com/v1' : undefined}
                    disabled={!isSuperadmin}
                    value={sec[key] ?? ''}
                    onChange={(e) => setVal(section, key, key === 'max_tokens' && e.target.value !== '' ? +e.target.value : e.target.value)}
                  />
                  {hint && <p className="text-[11px] text-ampas/70 mt-1">{hint}</p>}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ai_enabled"
                  disabled={!isSuperadmin}
                  checked={!!sec.enabled}
                  onChange={(e) => setVal(section, 'enabled', e.target.checked)}
                />
                <label htmlFor="ai_enabled" className="text-sm text-ampas">Aktifkan analisis AI</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ai_auto"
                  disabled={!isSuperadmin}
                  checked={!!sec.analyze_before_convert}
                  onChange={(e) => setVal(section, 'analyze_before_convert', e.target.checked)}
                />
                <label htmlFor="ai_auto" className="text-sm text-ampas">Auto-analisis sebelum konversi</label>
              </div>
            </div>
          </>
        )}
      </div>

      {section === 'conversion_settings' && (
        <p className="text-xs text-ampas/70">
          Limit default user baru dan preset paket ada di menu <strong>Limit Default</strong>.
        </p>
      )}

      {/* Konfirmasi simpan */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={22} className="text-kuningan flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-arang">Simpan System Settings?</h3>
                <p className="text-sm text-ampas mt-1">
                  Perubahan berlaku untuk proses berikutnya. Data yang sudah ada tidak diubah.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Menyimpan...' : 'Ya, Simpan'}
              </button>
              <button onClick={() => setConfirm(false)} className="btn-secondary flex-1">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
