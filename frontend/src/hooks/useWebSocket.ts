import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

// Kontrak event sinkron dengan backend/app/api/websocket.py (BUG-F04).
export type WSEvent =
  | { type: 'connected'; user_id: string; message?: string }
  | { type: 'ping' | 'pong' }
  | { type: 'job_status_update'; job_id: string; status: string; progress?: number }
  | { type: 'job_completed'; job_id: string; output_files: Record<string, string> }
  | { type: 'job_failed'; job_id: string; error: string }
  | { type: 'usage_limit_warning'; used: number; max: number; scope: string; percent: number }

type EventHandler = (event: WSEvent) => void

export function useWebSocket(onEvent?: EventHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Handler terbaru disimpan di ref: callback inline baru tidak lagi
  // membongkar dan membuat ulang socket setiap render.
  const onEventRef = useRef<EventHandler | undefined>(onEvent)
  onEventRef.current = onEvent

  const user = useAuthStore((s) => s.user)
  const userId = user?.id
  // Ikut token: WS hanya bisa tersambung setelah access token ada (sesi dipulihkan).
  const hasToken = useAuthStore((s) => !!s.accessToken)
  const connect = useCallback(() => {
    if (!userId) return
    const token = useAuthStore.getState().accessToken
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/ws/${userId}?token=${encodeURIComponent(token)}`
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
          const pct = Number(event.percent)
          const label = Number.isFinite(pct) ? `${Math.round(pct)}%` : 'hampir habis'
          toast(`Peringatan: limit ${event.scope ?? 'harian'} ${label}`, { icon: '⚠️' })
        }
        onEventRef.current?.(event)
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      wsRef.current = null
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null
        connect()
      }, 3000)
    }

    ws.onerror = () => ws.close()
  }, [userId])

  useEffect(() => {
    if (!userId || !hasToken) return
    connect()
    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        // Lepas handler dulu agar onclose tidak menjadwalkan reconnect baru.
        ws.onclose = null
        ws.onerror = null
        ws.close()
      }
    }
  }, [userId, hasToken, connect])

  return wsRef
}
