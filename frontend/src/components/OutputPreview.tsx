import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { getFileArrayBuffer } from '@/services/jobService'
import { Download } from 'lucide-react'

// ── STL 3D viewer ─────────────────────────────────────────────────────────────
export function StlModel({ url }: { url: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let alive = true
    const loader = new STLLoader()
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (!alive) return
        const geo = loader.parse(buf)
        geo.computeBoundingBox()
        geo.computeVertexNormals()
        const center = new THREE.Vector3()
        geo.boundingBox!.getCenter(center)
        geo.translate(-center.x, -center.y, -center.z)
        setGeometry(geo)
      })
      .catch(() => setGeometry(null))
    return () => { alive = false }
  }, [url])
  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#b98c53" roughness={0.75} metalness={0.05} />
    </mesh>
  )
}

export function StlViewer({ url, height = 320 }: { url: string; height?: number }) {
  return (
    <div className="rounded-xl overflow-hidden bg-arang" style={{ height }}>
      <Canvas camera={{ position: [0, 0, 50], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 8]} intensity={0.9} />
        <directionalLight position={[-10, -6, 6]} intensity={0.4} />
        <StlModel url={url} />
        <OrbitControls />
      </Canvas>
    </div>
  )
}

// ── DXF preview ───────────────────────────────────────────────────────────────
// Parses the 2D vector entities (LWPOLYLINE / LINE) that the backend writes and
// renders them as an SVG so the user can see the contour geometry without CAD.
type Pt = { x: number; y: number }

function parseDxfPolylines(text: string): Pt[][] {
  const lines = text.split(/\r?\n/).map((s) => s.trim())
  const pairs: Array<[number, string]> = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i], 10)
    if (!Number.isNaN(code)) pairs.push([code, lines[i + 1]])
  }
  const polys: Pt[][] = []
  let entity = ''
  let cur: Pt[] = []
  let pendingX: number | null = null
  const flush = () => { if (cur.length > 1) polys.push(cur); cur = []; pendingX = null }

  for (const [code, val] of pairs) {
    if (code === 0) { flush(); entity = val.toUpperCase(); continue }
    if (entity === 'LWPOLYLINE') {
      if (code === 10) pendingX = parseFloat(val)
      else if (code === 20 && pendingX !== null) { cur.push({ x: pendingX, y: parseFloat(val) }); pendingX = null }
    } else if (entity === 'LINE' || entity === 'POLYLINE' || entity === 'VERTEX') {
      if (code === 10 || code === 11) pendingX = parseFloat(val)
      else if ((code === 20 || code === 21) && pendingX !== null) { cur.push({ x: pendingX, y: parseFloat(val) }); pendingX = null }
    }
  }
  flush()
  return polys
}

export function DxfViewer({ url }: { url: string }) {
  const [polys, setPolys] = useState<Pt[][] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(url)
      .then((r) => r.text())
      .then((txt) => {
        if (!alive) return
        const p = parseDxfPolylines(txt)
        if (p.length === 0) setError('Tidak ada polyline 2D pada file DXF ini.')
        else setPolys(p)
      })
      .catch(() => setError('Gagal membaca file DXF.'))
    return () => { alive = false }
  }, [url])

  const view = useMemo(() => {
    if (!polys) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of polys) for (const q of p) {
      if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x
      if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y
    }
    const w = Math.max(1e-6, maxX - minX)
    const h = Math.max(1e-6, maxY - minY)
    const paths = polys.map((p) =>
      p.map((q, i) => `${i === 0 ? 'M' : 'L'}${(q.x - minX).toFixed(2)} ${(h - (q.y - minY)).toFixed(2)}`).join(' ') + ' Z'
    ).join(' ')
    return { w, h, paths, count: polys.length }
  }, [polys])

  if (error) return (
    <div className="rounded-xl bg-serat p-6 text-center text-sm text-ampas">{error}</div>
  )
  if (!view) return (
    <div className="rounded-xl bg-serat h-64 animate-pulse" />
  )
  return (
    <div>
      <div className="rounded-xl bg-white border border-kayu p-4 flex items-center justify-center max-h-80 overflow-auto">
        <svg viewBox={`0 0 ${view.w} ${view.h}`} className="max-h-72 w-auto max-w-full" preserveAspectRatio="xMidYMid meet">
          <path d={view.paths} fill="none" stroke="#6b4f2a" strokeWidth={Math.max(view.w, view.h) / 500} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <p className="text-xs text-ampas mt-2">{view.count} kontur · {view.w.toFixed(1)} × {view.h.toFixed(1)} mm</p>
    </div>
  )
}

// ── Output preview panel (used by History detail) ────────────────────────────
interface OutputPreviewProps {
  jobId: string
  formats: string[]
  onDownload: (fmt: string) => void
}

export default function OutputPreview({ jobId, formats, onDownload }: OutputPreviewProps) {
  const [active, setActive] = useState(formats[0] ?? 'stl')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fmt = active
    if (!fmt || urls[fmt]) return
    let alive = true
    setLoading(true)
    // Backend sends application/octet-stream, so set the MIME type here;
    // browsers refuse to render an SVG blob without image/svg+xml.
    const MIME: Record<string, string> = { svg: 'image/svg+xml', stl: 'model/stl', dxf: 'application/dxf' }
    getFileArrayBuffer(jobId, fmt)
      .then((buf) => {
        const u = URL.createObjectURL(new Blob([buf], { type: MIME[fmt] ?? 'application/octet-stream' }))
        if (alive) setUrls((prev) => ({ ...prev, [fmt]: u }))
        else URL.revokeObjectURL(u)
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [active, jobId, urls])

  // Revoke object URLs only on unmount (keep loaded previews alive while switching tabs).
  const urlsRef = useRef(urls)
  urlsRef.current = urls
  useEffect(() => () => { Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u)) }, [])

  if (formats.length === 0) return null
  const url = urls[active]

  return (
    <div className="bg-serat rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex rounded-lg border border-kayu overflow-hidden text-xs">
          {formats.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setActive(fmt)}
              className={fmt === active ? 'px-3 py-1.5 bg-primary-600 text-white uppercase' : 'px-3 py-1.5 bg-white text-ampas uppercase'}
            >
              {fmt}
            </button>
          ))}
        </div>
        <button onClick={() => onDownload(active)} className="text-primary-600 hover:underline font-medium flex items-center gap-1 text-sm">
          <Download size={13} /> Download {active.toUpperCase()}
        </button>
      </div>

      {loading && !url && <div className="rounded-xl bg-white/60 h-64 animate-pulse" />}
      {url && active === 'stl' && <StlViewer url={url} />}
      {url && active === 'dxf' && <DxfViewer url={url} />}
      {url && active === 'svg' && (
        <div className="rounded-xl bg-white border border-kayu p-4 flex items-center justify-center max-h-80 overflow-auto">
          <img src={url} alt="SVG output" className="max-h-72 w-auto max-w-full" />
        </div>
      )}
    </div>
  )
}
