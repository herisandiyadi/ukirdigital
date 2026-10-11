import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

import { fetchLimits, analyzeImage, startConversion, getJob, getFileBlobUrl, downloadFile, downloadAllFiles } from '@/services/jobService'
import type { LimitsStatus, AIAnalysis, ConversionJob, ConversionMethod } from '@/types'
import { StatusBadge } from '@/components/StatusBadge'
import LiveReliefPreview from '@/components/LiveReliefPreview'
import { Upload, ChevronRight, CheckCircle2, Cpu, Settings2, Download } from 'lucide-react'

// ── 3D STL viewer ─────────────────────────────────────────────────────────────
function StlModel({ url }: { url: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    const loader = new STLLoader()
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const geo = loader.parse(buf)
        geo.computeBoundingBox()
        // Smooth shading (important for relief look)
        geo.computeVertexNormals()
        const center = new THREE.Vector3()
        geo.boundingBox!.getCenter(center)
        geo.translate(-center.x, -center.y, -center.z)
        setGeometry(geo)
      })
  }, [url])
  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#b98c53" roughness={0.75} metalness={0.05} />
    </mesh>
  )
}

// ── Steps indicator ───────────────────────────────────────────────────────────
const STEPS = ['Upload', 'Analisis AI', 'Pengaturan', 'Proses & Hasil']

function StepsIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={clsx(
              'h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
              i < current  ? 'bg-primary-600 border-primary-600 text-white'
              : i === current ? 'border-primary-600 text-primary-600 bg-white'
              : 'border-kayu text-ampas/70 bg-white'
            )}>
              {i < current ? <CheckCircle2 size={16} /> : i + 1}
            </div>
            <span className={clsx('text-xs mt-1 whitespace-nowrap', i === current ? 'text-primary-700 font-medium' : 'text-ampas/70')}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={clsx('flex-1 h-0.5 mx-2 mb-5', i < current ? 'bg-primary-600' : 'bg-kayu/50')} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Format size ───────────────────────────────────────────────────────────────
const fmtBytes = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`

// ── Main component ────────────────────────────────────────────────────────────
export default function ConvertPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [limits, setLimits] = useState<LimitsStatus | null>(null)

  // Step 1
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)

  // Step 2
  const [analyzing, setAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null)

  // Step 3
  const [method, setMethod] = useState<ConversionMethod>('relief')
  const [threshold, setThreshold] = useState(80)
  const [maxHeight, setMaxHeight] = useState(4)
  const [baseThickness, setBaseThickness] = useState(2)
  const [scale, setScale] = useState(0.2)
  const [resolution, setResolution] = useState(2)
  const [smoothingBlur, setSmoothingBlur] = useState(1.0)
  const [formats, setFormats] = useState<string[]>(['stl'])
  const [showOriginal, setShowOriginal] = useState(false)
  const [outlineType, setOutlineType] = useState<'none' | 'rectangle' | 'circle'>('none')
  const [outlineThickness, setOutlineThickness] = useState(1)
  const [ballRadius, setBallRadius] = useState<number | undefined>(undefined)

  // Step 4
  const [job, setJob] = useState<ConversionJob | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [stlBlobUrl, setStlBlobUrl] = useState<string | null>(null)
  const [svgBlobUrl, setSvgBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    fetchLimits().then(setLimits).catch(() => {})
    return () => { pollRef.current && clearInterval(pollRef.current) }
  }, [])

  // When job completes, fetch authenticated blob URLs for previews
  useEffect(() => {
    let mounted = true
    if (!job) {
      if (stlBlobUrl) { URL.revokeObjectURL(stlBlobUrl); setStlBlobUrl(null) }
      if (svgBlobUrl) { URL.revokeObjectURL(svgBlobUrl); setSvgBlobUrl(null) }
      return
    }
    if (job.status === 'completed') {
      if (job.output_files && 'stl' in job.output_files) {
        getFileBlobUrl(job.id, 'stl').then(url => { if (mounted) setStlBlobUrl(url) }).catch(() => {})
      }
      if (job.output_files && 'svg' in job.output_files) {
        getFileBlobUrl(job.id, 'svg').then(url => { if (mounted) setSvgBlobUrl(url) }).catch(() => {})
      }
    }
    return () => { mounted = false }
  }, [job])

  // ── Step 1: Upload ──────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]
    if (!f) return
    if (limits && f.size > limits.max_file_size_mb * 1024 * 1024) {
      toast.error(`File terlalu besar. Maks ${limits.max_file_size_mb} MB`)
      return
    }
    setFile(f)
    const url = URL.createObjectURL(f)
    setPreview(url)
    const img = new Image()
    img.onload = () => setImgDims({ w: img.width, h: img.height })
    img.src = url
  }, [limits])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/png': [], 'image/jpeg': [], 'image/webp': [] },
    multiple: false,
  })

  const handleNextFromUpload = async () => {
    if (!file) return
    if (limits?.use_ai_analysis) {
      setStep(1)
      setAnalyzing(true)
      try {
        const res = await analyzeImage(file)
        setAiResult(res.analysis)
        if (res.analysis.recommended_method) setMethod(res.analysis.recommended_method)
        if (res.analysis.suggested_threshold != null) setThreshold(res.analysis.suggested_threshold)
        if (res.analysis.suggested_max_height_mm != null) setMaxHeight(res.analysis.suggested_max_height_mm)
      } catch {
        toast.error('Analisis AI gagal, lanjutkan manual')
        setAiResult(null)
      } finally {
        setAnalyzing(false)
      }
    } else {
      setStep(2)
    }
  }

  // ── Step 2: Accept AI ───────────────────────────────────────────────────────
  const acceptAI = () => setStep(2)

  // ── Step 3: Start conversion ────────────────────────────────────────────────
  const handleConvert = async () => {
    if (!file) return
    try {
      const newJob = await startConversion({
        file,
        formats: formats.join(','),
        method,
        threshold,
        max_height_mm: maxHeight,
        base_thickness_mm: baseThickness,
        scale_mm_per_px: scale,
        resolution,
        // Only relevant for relief/heightmap/profile surface quality
        smoothing_blur_radius: method !== 'silhouette' ? smoothingBlur : 0,
        outline_type: outlineType !== 'none' ? outlineType : undefined,
        outline_thickness: outlineType !== 'none' ? outlineThickness : undefined,
        ball_radius_mm: ballRadius,  // Ball nose radius for CNC machining
      })
      setJob(newJob)
      setStep(3)
      pollRef.current = setInterval(async () => {
        const updated = await getJob(newJob.id)
        setJob(updated)
        if (updated.status === 'completed' || updated.status === 'failed') {
          clearInterval(pollRef.current!)
        }
      }, 2000)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Gagal memulai konversi')
    }
  }

  const handleNewConvert = () => {
    pollRef.current && clearInterval(pollRef.current)
    setStep(0); setFile(null); setPreview(null); setAiResult(null); setJob(null)
  }

  const toggleFormat = (fmt: string) => {
    if (!limits) return
    setFormats((prev) =>
      prev.includes(fmt)
        ? prev.filter((f) => f !== fmt)
        : prev.length < limits.max_output_formats
          ? [...prev, fmt]
          : (toast.error(`Maks ${limits.max_output_formats} format`), prev)
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-arang mb-6">Konversi Gambar ke 3D</h1>
      <StepsIndicator current={step} />

      {/* ── STEP 0: Upload ── */}
      {step === 0 && (
        <div className="card">
          {limits?.daily_limit_hit && (
            <div className="mb-4 rounded-lg bg-status-gagal border border-status-gagal p-4 text-sm text-status-gagal">
              ⚠️ Kuota konversi harian Anda sudah habis ({limits.used_today}/{limits.max_per_day}). Coba lagi besok.
            </div>
          )}
          <div
            {...getRootProps()}
            className={clsx(
              'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
              isDragActive ? 'border-primary-500 bg-primary-50' : 'border-kayu hover:border-primary-400 hover:bg-serat'
            )}
          >
            <input {...getInputProps()} />
            <Upload size={40} className="mx-auto text-ampas/70 mb-3" />
            <p className="text-ampas font-medium">
              {isDragActive ? 'Lepaskan file di sini...' : 'Drag & drop gambar, atau klik untuk memilih'}
            </p>
            <p className="text-xs text-ampas/70 mt-1">
              PNG, JPG, WEBP — Maks {limits?.max_file_size_mb ?? 10} MB
            </p>
          </div>

          {file && preview && (
            <div className="mt-6 flex items-start gap-6 p-4 bg-serat rounded-xl">
              <img src={preview} alt="preview" className="h-24 w-24 rounded-lg object-contain bg-white border" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-arang">{file.name}</p>
                <p className="text-ampas">Ukuran: {fmtBytes(file.size)}</p>
                {imgDims && <p className="text-ampas">Dimensi: {imgDims.w} × {imgDims.h} px</p>}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleNextFromUpload}
              disabled={!file || limits?.daily_limit_hit}
              className="btn-primary"
            >
              Lanjutkan <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 1: AI Analysis ── */}
      {step === 1 && (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <Cpu size={22} className="text-primary-600" />
            <h2 className="font-semibold text-arang text-lg">Analisis AI</h2>
          </div>

          {analyzing ? (
            <div className="flex flex-col items-center py-12 gap-4">
              <div className="h-12 w-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
              <p className="text-ampas">AI sedang menganalisis gambar...</p>
            </div>
          ) : aiResult ? (
            <div className="space-y-4">
              {/* Preview gambar input (BUG-PRV01): tampil di samping hasil AI */}
              {preview && (
                <div className="flex items-center justify-center rounded-xl bg-white border border-kayu p-3">
                  <img src={preview} alt="Gambar yang dianalisis AI" className="max-h-64 w-auto rounded-lg object-contain" />
                </div>
              )}
              {aiResult.parse_error ? (
                <pre className="text-xs bg-serat p-3 rounded overflow-auto">{aiResult.raw_analysis}</pre>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    ['Kompleksitas', aiResult.complexity],
                    ['Background', aiResult.background],
                    ['Metode Rekomendasi', aiResult.recommended_method],
                    ['Threshold', aiResult.suggested_threshold],
                    ['Tinggi Relief (mm)', aiResult.suggested_max_height_mm],
                    ['Format Rekomendasi', (aiResult.recommended_formats ?? []).join(', ')],
                  ].map(([k, v]) => v != null && (
                    <div key={String(k)} className="bg-serat rounded-lg p-3">
                      <p className="text-xs text-ampas">{k}</p>
                      <p className="text-sm font-semibold text-arang capitalize">{String(v)}</p>
                    </div>
                  ))}
                </div>
              )}
              {aiResult.notes && (
                <div className="bg-status-proses rounded-lg p-3 text-sm text-status-proses">
                  <strong>Catatan:</strong> {aiResult.notes}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={acceptAI} className="btn-primary">
                  Gunakan Rekomendasi AI
                </button>
                <button onClick={() => setStep(2)} className="btn-secondary">
                  Atur Manual
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-ampas">
              <p>Analisis AI tidak tersedia.</p>
              <button onClick={() => setStep(2)} className="btn-primary mt-4">Lanjutkan Manual</button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2: Settings ── */}
      {step === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Preview: live estimate of the relief from current settings */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ampas">Preview Hasil (estimasi)</h3>
              <div className="flex rounded-lg border border-kayu overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setShowOriginal(false)}
                  className={clsx('px-3 py-1.5', !showOriginal ? 'bg-primary-600 text-white' : 'bg-white text-ampas')}
                >
                  Relief
                </button>
                <button
                  type="button"
                  onClick={() => setShowOriginal(true)}
                  className={clsx('px-3 py-1.5', showOriginal ? 'bg-primary-600 text-white' : 'bg-white text-ampas')}
                >
                  Gambar Asli
                </button>
              </div>
            </div>
            {preview && (
              showOriginal
                ? <div className="flex items-center justify-center"><img src={preview} alt="preview" className="max-h-72 rounded-lg object-contain" /></div>
                : <LiveReliefPreview
                    imageUrl={preview}
                    resolution={resolution}
                    scale={scale}
                    threshold={threshold}
                    maxHeight={maxHeight}
                    baseThickness={baseThickness}
                    smoothing={method !== 'silhouette' ? smoothingBlur : 0}
                    method={method}
                    imgDims={imgDims ?? { w: 0, h: 0 }}
                  />
            )}
          </div>

          {/* Form */}
          <div className="card space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 size={20} className="text-primary-600" />
              <h2 className="font-semibold text-arang">Pengaturan Konversi</h2>
            </div>

            {/* Method */}
            <div>
              <label className="label">Metode Konversi</label>
              <div className="space-y-2">
                {([
                  ['heightmap', 'Heightmap', 'Kecerahan piksel = tinggi voxel'],
                  ['relief',    'Relief / Emboss', 'Piksel putih diextrude ke atas (default)'],
                  ['profile',   'Profile / Pocket', 'Carving: Kedalaman proporsional brightness (seperti Aspire)'],
                  ['silhouette','Silhouette', 'Hanya tepi gambar yang diextrude'],
                ] as [ConversionMethod, string, string][]).map(([val, label, desc]) => (
                  <label key={val} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="method"
                      value={val}
                      checked={method === val}
                      onChange={() => setMethod(val)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-arang">{label}</span>
                      <span className="text-xs text-ampas/70 ml-2">{desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Threshold */}
            <div>
              <label className="label">Threshold: <span className="font-bold text-primary-600">{threshold}</span></label>
              <input type="range" min={0} max={255} value={threshold} onChange={(e) => setThreshold(+e.target.value)} className="w-full" />
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Tinggi Relief (mm)</label>
                <input type="number" min={1} max={20} step={0.5} value={maxHeight} onChange={(e) => setMaxHeight(+e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Ketebalan Base (mm)</label>
                <input type="number" min={1} max={10} step={0.5} value={baseThickness} onChange={(e) => setBaseThickness(+e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Scale (mm/px)</label>
                <input type="number" min={0.05} max={1} step={0.05} value={scale} onChange={(e) => setScale(+e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Resolusi</label>
                <select value={resolution} onChange={(e) => setResolution(+e.target.value)} className="input">
                  <option value={4}>Rendah (cepat)</option>
                  <option value={2}>Sedang</option>
                  <option value={1}>Tinggi (lambat)</option>
                </select>
              </div>
            </div>

            {/* Smoothing */}
            {method !== 'silhouette' && (
              <div className="border-t pt-4">
                <label className="label">
                  Smoothing (haluskan relief): <span className="font-bold text-primary-600">{smoothingBlur.toFixed(1)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={smoothingBlur}
                  onChange={(e) => setSmoothingBlur(+e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-ampas mt-2">
                  Nilai lebih besar = lebih halus (tapi detail bisa berkurang). Rekomendasi: 0.8–1.5 untuk ornamen.
                </p>
              </div>
            )}

            {/* Formats */}
            <div>
              <label className="label">Format Output</label>
              <div className="flex gap-3">
                {(limits?.allowed_formats ?? ['stl', 'svg', 'dxf']).map((fmt) => (
                  <label key={fmt} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formats.includes(fmt)}
                      onChange={() => toggleFormat(fmt)}
                    />
                    <span className="text-sm font-medium uppercase">{fmt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Outline Settings */}
            <div className="border-t pt-4">
              <label className="label">Outline / Border</label>
              <div className="space-y-3">
                <div className="space-y-2">
                  {([
                    ['none', 'Tidak Ada', 'Tanpa outline'],
                    ['rectangle', 'Persegi Panjang', 'Border berbentuk kotak'],
                    ['circle', 'Lingkaran', 'Border berbentuk bulat'],
                  ] as ['none' | 'rectangle' | 'circle', string, string][]).map(([val, label, desc]) => (
                    <label key={val} className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="outline"
                        value={val}
                        checked={outlineType === val}
                        onChange={() => setOutlineType(val)}
                        className="mt-0.5"
                      />
                      <div>
                        <span className="text-sm font-medium text-arang">{label}</span>
                        <span className="text-xs text-ampas/70 ml-2">{desc}</span>
                      </div>
                    </label>
                  ))}
                </div>

                {outlineType !== 'none' && (
                  <div className="bg-status-proses rounded-lg p-3 border border-status-proses">
                    <label className="label text-sm">
                      Ketebalan Outline: <span className="font-bold text-primary-600">{outlineThickness}mm</span>
                    </label>
                    <input
                      type="range"
                      min={0.5}
                      max={5}
                      step={0.5}
                      value={outlineThickness}
                      onChange={(e) => setOutlineThickness(+e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-ampas mt-2">
                      Outline diterapkan ke semua format output (STL, SVG, DXF)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* CNC Ball Radius (for Stepover calculation) */}
            <div className="border-t pt-4">
              <label className="label">
                CNC Ball Radius (Opsional)
                <span className="text-xs text-ampas/70 ml-2">Untuk perhitungan stepover</span>
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0.1}
                    max={20}
                    step={0.1}
                    value={ballRadius ?? ''}
                    onChange={(e) => setBallRadius(e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="Contoh: 1.5mm"
                    className="input flex-1"
                  />
                  <span className="text-sm font-medium text-ampas">mm</span>
                </div>
                {ballRadius !== undefined && (
                  <div className="bg-kuningan rounded-lg p-3 border border-kuningan">
                    <p className="text-xs text-ampas">
                      <span className="font-semibold">Ball Radius:</span> {ballRadius.toFixed(2)} mm
                    </p>
                    <p className="text-xs text-ampas mt-1">
                      <span className="font-semibold">Stepover (10%):</span> {(ballRadius * 0.1).toFixed(3)} mm
                    </p>
                    <p className="text-xs text-ampas mt-2">
                      Nilai stepover akan ditambahkan ke metadata DXF untuk referensi CNC machining.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button onClick={handleConvert} disabled={formats.length === 0} className="btn-primary w-full">
              Mulai Konversi
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Processing & Result ── */}
      {step === 3 && job && (
        <div className="card space-y-6">
          {/* Status */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-arang text-lg">
                {job.status === 'completed' ? '✅ Konversi Selesai' : job.status === 'failed' ? '❌ Konversi Gagal' : '⏳ Memproses...'}
              </h2>
              <p className="text-sm text-ampas mt-0.5">{job.original_filename}</p>
            </div>
            <StatusBadge status={job.status} />
          </div>

          {/* Progress bar for processing */}
          {(job.status === 'pending' || job.status === 'processing') && (
            <div className="h-2 w-full bg-kayu/30 rounded-full overflow-hidden">
              <div className="h-2 bg-primary-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          )}

          {job.status === 'failed' && (
            <div className="rounded-lg bg-status-gagal border border-status-gagal p-4 text-sm text-status-gagal">
              {job.error_message || 'Terjadi kesalahan saat konversi.'}
            </div>
          )}

          {/* Results */}
          {job.status === 'completed' && job.output_files && (
            <>
              {/* STL 3D preview */}
              {stlBlobUrl && (
                <div>
                  <h3 className="text-sm font-semibold text-ampas mb-2">Preview 3D (STL)</h3>
                  <div className="h-64 rounded-xl overflow-hidden bg-arang">
                    <Canvas camera={{ position: [0, 0, 50], fov: 50 }}>
                      <ambientLight intensity={0.6} />
                      <directionalLight position={[10, 10, 8]} intensity={0.9} />
                      <directionalLight position={[-10, -6, 6]} intensity={0.4} />
                      <StlModel url={stlBlobUrl} />
                      <OrbitControls />
                    </Canvas>
                  </div>
                </div>
              )}

              {/* SVG preview */}
              {svgBlobUrl && (
                <div>
                  <h3 className="text-sm font-semibold text-ampas mb-2">Preview SVG</h3>
                  <div className="border rounded-xl p-4 bg-white max-h-48 overflow-auto">
                    <img src={svgBlobUrl} alt="SVG preview" className="max-h-40 mx-auto" />
                  </div>
                </div>
              )}

              {/* File table */}
              <div>
                <h3 className="text-sm font-semibold text-ampas mb-2">File Output</h3>
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-ampas">Format</th>
                      <th className="text-right py-2 font-medium text-ampas">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(job.output_files).map((fmt) => (
                      <tr key={fmt} className="border-b last:border-0">
                        <td className="py-2 uppercase font-semibold text-arang">{fmt}</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => downloadFile(job.id, fmt)}
                            className="text-primary-600 hover:underline text-sm font-medium"
                          >
                            <Download size={14} className="inline mr-1" />
                            Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => downloadAllFiles(job.id)} className="btn-primary">
                  <Download size={16} />
                  Download Semua (ZIP)
                </button>
                <button onClick={handleNewConvert} className="btn-secondary">Konversi Baru</button>
              </div>
            </>
          )}

          {job.status === 'failed' && (
            <button onClick={handleNewConvert} className="btn-secondary">Coba Lagi</button>
          )}

          {job.processing_time_seconds != null && (
            <p className="text-xs text-ampas/70">Waktu proses: {job.processing_time_seconds}s</p>
          )}
        </div>
      )}
    </div>
  )
}