import api from './api'
import type {
  ConversionJob,
  ConversionJobListResponse,
  LimitsStatus,
  AnalyzeResponse,
  ConversionMethod,
} from '@/types'

// ── Limits ────────────────────────────────────────────────────────────────────
export const fetchLimits = (): Promise<LimitsStatus> =>
  api.get('/conversions/limits').then((r) => r.data)

// ── Analyze ───────────────────────────────────────────────────────────────────
export const analyzeImage = (file: File): Promise<AnalyzeResponse> => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/conversions/analyze', fd).then((r) => r.data)
}

// ── Convert ───────────────────────────────────────────────────────────────────
export interface ConvertParams {
  file: File
  formats: string
  method: ConversionMethod
  threshold?: number
  max_height_mm?: number
  base_thickness_mm?: number
  scale_mm_per_px?: number
  resolution?: number
  smoothing_blur_radius?: number
  outline_type?: 'rectangle' | 'circle'
  outline_thickness?: number
  ball_radius_mm?: number  // Ball nose radius for CNC machining
}

export const startConversion = (params: ConvertParams): Promise<ConversionJob> => {
  const fd = new FormData()
  fd.append('file', params.file)
  fd.append('formats', params.formats)
  fd.append('method', params.method)
  if (params.threshold       != null) fd.append('threshold',         String(params.threshold))
  if (params.max_height_mm   != null) fd.append('max_height_mm',     String(params.max_height_mm))
  if (params.base_thickness_mm != null) fd.append('base_thickness_mm', String(params.base_thickness_mm))
  if (params.scale_mm_per_px != null) fd.append('scale_mm_per_px',   String(params.scale_mm_per_px))
  if (params.resolution      != null) fd.append('resolution',        String(params.resolution))
  if (params.smoothing_blur_radius != null) fd.append('smoothing_blur_radius', String(params.smoothing_blur_radius))
  if (params.outline_type    != null) fd.append('outline_type',      params.outline_type)
  if (params.outline_thickness != null) fd.append('outline_thickness', String(params.outline_thickness))
  if (params.ball_radius_mm  != null) fd.append('ball_radius_mm',    String(params.ball_radius_mm))
  return api.post('/conversions', fd).then((r) => r.data)
}

// ── Job status ────────────────────────────────────────────────────────────────
export const getJob = (id: string): Promise<ConversionJob> =>
  api.get(`/conversions/${id}`).then((r) => r.data)

// ── List jobs ─────────────────────────────────────────────────────────────────
export interface ListJobsParams {
  page?: number
  limit?: number
  status?: string
  search?: string
}

export const listJobs = (params: ListJobsParams = {}): Promise<ConversionJobListResponse> => {
  const { page = 1, limit = 20, ...rest } = params
  const skip = (page - 1) * limit
  return api.get('/conversions', { params: { skip, limit, ...rest } }).then((r) => r.data)
}

// ── Delete ────────────────────────────────────────────────────────────────────
export const deleteJob = (id: string): Promise<void> =>
  api.delete(`/conversions/${id}`).then(() => undefined)

// ── Download helpers ──────────────────────────────────────────────────────────
export const downloadUrl = (jobId: string, fmt: string) =>
  `/api/conversions/${jobId}/download/${fmt}`

export const downloadAllUrl = (jobId: string) =>
  `/api/conversions/${jobId}/download-all`


// ── Helpers to fetch file blobs (for previews / STL parse) ───────────────────
export const getFileBlobUrl = async (jobId: string, fmt: string): Promise<string> => {
  const response = await api.get(`/conversions/${jobId}/download/${fmt}`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  return url
}

export const getFileArrayBuffer = async (jobId: string, fmt: string): Promise<ArrayBuffer> => {
  const response = await api.get(`/conversions/${jobId}/download/${fmt}`, { responseType: 'arraybuffer' })
  return response.data as ArrayBuffer
}
// ── Download dengan proper Authorization ──────────────────────────────────
export const downloadFile = async (jobId: string, fmt: string): Promise<void> => {
  try {
    const response = await api.get(`/conversions/${jobId}/download/${fmt}`, {
      responseType: 'blob',
    })

    const contentType = (response.headers['content-type'] || response.headers['Content-Type'] || '').toLowerCase()

    if (contentType.includes('application/json')) {
      const text = await (response.data as Blob).text()
      let errMsg = text
      try { const j = JSON.parse(text); errMsg = j.detail || j.error?.message || JSON.stringify(j) } catch (e) {}
      throw new Error(errMsg)
    }

    const inferredType = (response.headers['content-type'] || response.headers['Content-Type'] || 'application/octet-stream') as string
    const blob = new Blob([response.data], { type: inferredType })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `output_${jobId.slice(0, 8)}.${fmt}`)
    document.body.appendChild(link)
    link.click()

    // Cleanup (delay revoke to avoid canceling download in some browsers)
    setTimeout(() => {
      link.parentNode?.removeChild(link)
      window.URL.revokeObjectURL(url)
    }, 100)
  } catch (error: any) {
    throw new Error(error?.message || String(error))
  }
}
export const downloadAllFiles = async (jobId: string): Promise<void> => {
  try {
    const response = await api.get(`/conversions/${jobId}/download-all`, {
      responseType: 'blob',
    })

    // Check if response is JSON error
    const contentType = (response.headers['content-type'] || response.headers['Content-Type'] || '').toLowerCase()
    if (contentType.includes('application/json')) {
      const text = await (response.data as Blob).text()
      let errMsg = text
      try { 
        const j = JSON.parse(text)
        errMsg = j.detail || j.error?.message || JSON.stringify(j) 
      } catch (e) {}
      throw new Error(errMsg)
    }

    // Create blob and download
    const blob = new Blob([response.data], { type: 'application/zip' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `outputs_${jobId.slice(0, 8)}.zip`)
    document.body.appendChild(link)
    link.click()
    
    // Cleanup
    setTimeout(() => {
      link.parentNode?.removeChild(link)
      window.URL.revokeObjectURL(url)
    }, 100)
  } catch (error: any) {
    const msg = error?.response?.data?.detail || error?.message || String(error)
    throw new Error(`Download ZIP failed: ${msg}`)
  }
}

