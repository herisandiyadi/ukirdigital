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

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refreshToken = useAuthStore.getState().refreshToken
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
