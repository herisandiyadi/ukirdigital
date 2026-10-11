import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConversionMethod } from '@/types'

/**
 * LiveReliefPreview — renders an approximate, real-time render of the relief
 * that the current conversion settings will produce.
 *
 * The render mirrors the backend pipeline (converters.py) closely enough to be
 * a useful estimate:
 *   1. downsample to a working grid (same 512//resolution cap as the backend)
 *   2. contrast stretch (2%/98% percentiles) + gamma
 *   3. gaussian smoothing (blur radius = smoothing_blur_radius)
 *   4. height mapping per method:
 *        - relief/heightmap/profile, grayscale: h = (gray/255)*maxHeight,
 *          with h = 0 where gray <= threshold
 *        - binary relief: h = maxHeight where gray > threshold
 *        - silhouette: edges only
 *   5. shaded surface render (lambert) so the shape reads as 3D
 *
 * Physical dimensions use the same math as the backend: the working grid keeps
 * the original physical size, so width_mm = cols * scale * downsampleRatio.
 *
 * It is an estimate, not the final mesh — the real STL is still produced by the
 * backend. Updates are debounced to one animation frame per interaction.
 */

interface Props {
  imageUrl: string
  resolution: number
  scale: number
  threshold: number
  maxHeight: number
  baseThickness: number
  smoothing: number
  method: ConversionMethod
  reliefDetail?: 'grayscale' | 'binary'
  imgDims: { w: number; h: number }
}

// Contrast stretch percentiles — keep in sync with backend defaults.
const LOW_PCT = 2
const HIGH_PCT = 98

// Procedural vertical wood grain in [0,1]: long fibres along y, slight waviness.
function woodGrain(x: number, y: number, w: number, h: number): number {
  const u = x / Math.max(1, w)
  const v = y / Math.max(1, h)
  const wave = Math.sin(v * 40 + Math.sin(u * 9) * 1.5) * 0.5 + 0.5
  const fine = Math.sin((u * 220 + Math.sin(v * 6) * 3)) * 0.5 + 0.5
  return 0.6 * wave + 0.4 * fine
}

function percentileStretch(gray: Float32Array) {
  const n = gray.length
  if (n === 0) return gray
  const sample = gray.slice().sort()
  const lo = sample[Math.floor((LOW_PCT / 100) * (n - 1))]
  const hi = sample[Math.floor((HIGH_PCT / 100) * (n - 1))]
  if (hi <= lo) return gray
  const out = new Float32Array(n)
  const span = hi - lo
  for (let i = 0; i < n; i++) {
    out[i] = ((gray[i] - lo) / span) * 255
    if (out[i] < 0) out[i] = 0
    else if (out[i] > 255) out[i] = 255
  }
  return out
}

export default function LiveReliefPreview({
  imageUrl, resolution, scale, threshold, maxHeight, baseThickness,
  smoothing, method, reliefDetail = 'grayscale', imgDims,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const baseRef = useRef<{ gray: Float32Array; w: number; h: number; mmPerPx: number } | null>(null)
  const [gridInfo, setGridInfo] = useState<{ w: number; h: number; mmPerPx: number } | null>(null)
  const [ready, setReady] = useState(false)

  // ── Step A: build the downsampled grayscale grid (depends on image + resolution)
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      const maxDim = Math.max(1, Math.floor(512 / resolution))
      const ratio = Math.max(img.width, img.height) / maxDim
      const w = Math.max(1, Math.round(img.width / ratio))
      const h = Math.max(1, Math.round(img.height / ratio))

      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h).data

      const gray = new Float32Array(w * h)
      for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
        gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
      }
      const stretched = percentileStretch(gray)

      // Physical mm-per-working-pixel. The working grid preserves physical size,
      // so effective mm/px = scale * downsampleRatio (matches _load_gray_and_scale).
      const mmPerPx = scale * ratio
      baseRef.current = { gray: stretched, w, h, mmPerPx }
      setGridInfo({ w, h, mmPerPx })
      setReady(true)
    }
    img.onerror = () => setReady(false)
    img.src = imageUrl
    return () => { cancelled = true }
  }, [imageUrl, resolution, scale])

  // ── Step B: apply smoothing + height map + shaded render (depends on all sliders)
  useEffect(() => {
    if (!ready || !baseRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    let raf = 0
    raf = requestAnimationFrame(() => {
      const base = baseRef.current!
      const { gray, w, h } = base

      // Gamma + smoothing via a canvas blur pass (cheap + matches GaussianBlur).
      let work = gray
      if (smoothing > 0) {
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        const id = ctx.createImageData(w, h)
        for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
          const v = gray[i]
          id.data[p] = id.data[p + 1] = id.data[p + 2] = v
          id.data[p + 3] = 255
        }
        ctx.putImageData(id, 0, 0)
        const c2 = document.createElement('canvas')
        c2.width = w; c2.height = h
        const ctx2 = c2.getContext('2d', { willReadFrequently: true })!
        ctx2.filter = `blur(${smoothing}px)`
        ctx2.drawImage(c, 0, 0)
        const out = ctx2.getImageData(0, 0, w, h).data
        work = new Float32Array(w * h)
        for (let i = 0, p = 0; i < work.length; i++, p += 4) work[i] = out[p]
      }

      // Height map per method.
      const heights = new Float32Array(w * h)
      const isSilhouette = method === 'silhouette'
      const binary = method === 'relief' && reliefDetail === 'binary'

      if (isSilhouette) {
        // Edge extraction (Sobel magnitude) → thin walls.
        const mag = new Float32Array(w * h)
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x
            const gx =
              -work[i - w - 1] - 2 * work[i - 1] - work[i + w - 1] +
               work[i - w + 1] + 2 * work[i + 1] + work[i + w + 1]
            const gy =
              -work[i - w - 1] - 2 * work[i - w] - work[i - w + 1] +
               work[i + w - 1] + 2 * work[i + w] + work[i + w + 1]
            mag[i] = Math.sqrt(gx * gx + gy * gy)
          }
        }
        for (let i = 0; i < heights.length; i++) {
          heights[i] = mag[i] > threshold * 3 ? maxHeight : 0
        }
      } else if (binary) {
        for (let i = 0; i < heights.length; i++) {
          heights[i] = work[i] > threshold ? maxHeight : 0
        }
      } else {
        // grayscale relief / heightmap / profile: brightness → height, floor at threshold
        for (let i = 0; i < heights.length; i++) {
          heights[i] = work[i] <= threshold ? 0 : (work[i] / 255) * maxHeight
        }
      }

      // Shaded surface render (lambert from top-left-above).
      canvas.width = w
      canvas.height = h
      const octx = canvas.getContext('2d')!
      const oid = octx.createImageData(w, h)
      const LX = 0.45, LY = -0.55, LZ = 0.70
      const llen = Math.sqrt(LX * LX + LY * LY + LZ * LZ)
      // Wood look: pale maple/birch tone with vertical grain (matches reference carving).
      const WOOD_LIGHT = [226, 196, 150]
      const WOOD_DARK = [168, 122, 74]

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          const hc = heights[i]
          const grain = woodGrain(x, y, w, h)
          const hx = heights[y * w + Math.min(w - 1, x + 1)] - heights[y * w + Math.max(0, x - 1)]
          const hy = heights[Math.min(h - 1, y + 1) * w + x] - heights[Math.max(0, y - 1) * w + x]
          const nx = -hx
          const ny = -hy
          const nz = 2 * (base.mmPerPx || 1)
          const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
          const diff = Math.max(0, (nx * LX + ny * LY + nz * LZ) / (nlen * llen))
          const shade = 0.30 + 0.85 * diff
          // Carved areas read as raised wood (lighter + warm highlight),
          // recesses/background keep the darker grain tone.
          const grainMix = 0.85 + 0.15 * grain
          const carved = hc > 0
          const rr = carved ? WOOD_LIGHT[0] : WOOD_DARK[0]
          const gg = carved ? WOOD_LIGHT[1] : WOOD_DARK[1]
          const bb = carved ? WOOD_LIGHT[2] : WOOD_DARK[2]
          const p = i * 4
          oid.data[p] = Math.min(255, rr * shade * grainMix)
          oid.data[p + 1] = Math.min(255, gg * shade * grainMix)
          oid.data[p + 2] = Math.min(255, bb * shade * grainMix)
          oid.data[p + 3] = 255
        }
      }
      octx.putImageData(oid, 0, 0)
    })
    return () => cancelAnimationFrame(raf)
  }, [ready, resolution, scale, smoothing, threshold, maxHeight, method, reliefDetail, gridInfo])

  // Physical footprint: working grid preserves the original physical size.
  const dims = useMemo(() => {
    if (!gridInfo || !imgDims.w) return null
    const wmm = imgDims.w * scale
    const hmm = imgDims.h * scale
    return {
      w: wmm.toFixed(1),
      h: hmm.toFixed(1),
      total: (baseThickness + maxHeight).toFixed(1),
      cells: `${gridInfo.w}×${gridInfo.h}`,
    }
  }, [gridInfo, imgDims, scale, baseThickness, maxHeight])

  return (
    <div className="w-full">
      <div className="rounded-xl overflow-hidden bg-arang flex items-center justify-center">
        <canvas ref={canvasRef} className="max-h-72 w-auto max-w-full [image-rendering:auto]" />
      </div>
      {dims && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-ampas">
          <span>Ukuran: <b className="text-arang">{dims.w} × {dims.h} mm</b></span>
          <span>Tinggi total: <b className="text-arang">{dims.total} mm</b></span>
          <span>Grid: <b className="text-arang">{dims.cells}</b></span>
        </div>
      )}
      <p className="text-xs text-ampas/80 mt-2">
        Estimasi tampilan. Hasil STL final dihitung di server saat proses.
      </p>
    </div>
  )
}
