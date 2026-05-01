import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

export type WSEvent =
  | { type: 'job_status_update'; job_id: string; status: string; progress?: number }
  | { type: 'job_completed'; job_id: string; output_files: Record<string, string> }
  | { type: 'job_failed'; job_id: string; error: string }
  | { type: 'usage_limit_warning'; limit_type: string; used: number; limit: number; percentage: number }

type EventHandler = (event: WSEvent) => void

export function useWebSocket(onEvent?: EventHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const user = useAuthStore((s) => s.user)

  const connect = useCallback(() => {
    if (!user) return
    const token = useAuthStore.getState().accessToken
    if (!token) return
    
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/ws/${user.id}?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data)
        if (event.type === 'job_completed') {
          toast.success('Konversi selesai! File siap diunduh.')
        } else if (event.type === 'job_failed') {
          toast.error(`Konversi gagal: ${event.error}`)
        } else if (event.type === 'usage_limit_warning') {
          toast(`Peringatan: limit ${event.limit_type} hampir habis (${event.percentage.toFixed(0)}%)`, { icon: '⚠️' })
        }
        onEvent?.(event)
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      reconnectRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => ws.close()
  }, [user, onEvent])

  useEffect(() => {
    connect()
    return () => {
      reconnectRef.current && clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return wsRef
}
