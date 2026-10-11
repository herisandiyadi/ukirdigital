import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

// Determine API base URL
// - Lokal: use /api/v1 (proxied to localhost:8000 by vite)
// - Ngrok: use /api/v1 (proxied to localhost:8000 by vite)
// Vite proxy: /api → http://localhost:8000
// Result: /api/v1/auth/login → http://localhost:8000/api/v1/auth/login ✅
const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Endpoint yang tidak boleh memicu percobaan refresh (BUG-F01).
// Tanpa guard ini, 401 dari /auth/refresh sendiri memanggil interceptor lagi
// → rekursi tak berujung.
const REFRESH_EXEMPT = ['/auth/refresh', '/auth/login', '/auth/register']

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const url: string = original?.url ?? ''
    const isExempt = REFRESH_EXEMPT.some((p) => url.includes(p))
    if (error.response?.status === 401 && original && !original._retry && !isExempt) {
      original._retry = true
      try {
        const refreshToken = useAuthStore.getState().refreshToken
        if (!refreshToken) throw new Error('No refresh token')
        const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken })
        useAuthStore.getState().setTokens(data.access_token, data.refresh_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        useAuthStore.getState().logout()
      }
    }
    return Promise.reject(error)
  }
)

export default api
