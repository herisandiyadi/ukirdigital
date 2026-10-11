import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

// Determine API base URL
// - Lokal: use /api/v1 (proxied to localhost:8000 by vite)
// - Ngrok: use /api/v1 (proxied to localhost:8000 by vite)
// Vite proxy: /api → http://localhost:8000
// Result: /api/v1/auth/login → http://localhost:8000/api/v1/auth/login ✅
// withCredentials: cookie refresh httpOnly ikut terkirim (BUG-S04).
const api = axios.create({ baseURL: '/api/v1', withCredentials: true })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Endpoint yang tidak boleh memicu percobaan refresh (BUG-F01).
// Tanpa guard ini, 401 dari /auth/refresh sendiri memanggil interceptor lagi
// → rekursi tak berujung.
const REFRESH_EXEMPT = ['/auth/refresh', '/auth/login', '/auth/register']

// Refresh token dibaca backend dari cookie httpOnly, jadi tidak ada di JS.
// Satu permintaan refresh bersama, supaya beberapa 401 paralel tidak
// memicu beberapa refresh sekaligus (rotasi membuat yang kedua gagal).
let refreshing: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = api
      .post('/auth/refresh', {})
      .then(({ data }) => {
        useAuthStore.getState().setAccessToken(data.access_token)
        return data.access_token as string
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const url: string = original?.url ?? ''
    const isExempt = REFRESH_EXEMPT.some((p) => url.includes(p))
    if (error.response?.status === 401 && original && !original._retry && !isExempt) {
      original._retry = true
      try {
        const token = await refreshAccessToken()
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      } catch {
        useAuthStore.getState().logout()
      }
    }
    return Promise.reject(error)
  }
)

/**
 * Pulihkan sesi saat app dibuka: refresh dari cookie. Dipanggil sekali di App.
 * Tanpa ini, reload halaman membuat access token di memori hilang.
 */
export async function restoreSession(): Promise<void> {
  const store = useAuthStore.getState()
  try {
    await refreshAccessToken()
  } catch {
    store.logout()
  } finally {
    useAuthStore.getState().setReady(true)
  }
}

export default api
